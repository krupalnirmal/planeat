'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { Banknote, ChevronLeft, CreditCard, Loader2, MapPin, Wallet } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { Link, useRouter } from '@/i18n/navigation';
import { BillSummary, type BillView } from '@/components/shop/bill-summary';
import { openGatewayCheckout } from '@/components/wallet/gateway-checkout';
import { useSession } from '@/hooks/use-session';
import { ApiClientError, api, qs } from '@/lib/api/client';
import { formatPaise, paise } from '@/lib/money';
import { cn } from '@/lib/utils';

/**
 * Checkout (M3): address, slot, payment method, place order.
 *
 * R5 — the idempotency key is generated ONCE when the screen mounts and reused
 * for every attempt. That is the whole point: a request that times out on
 * rural 4G has very often succeeded, and the customer's next move is to tap
 * again. Generating a fresh key per tap would turn that into two orders.
 */

type SlotValue = 'EXPRESS' | 'MORNING_7_9' | 'EVENING_5_7';
type PaymentValue = 'WALLET' | 'RAZORPAY' | 'COD';

interface QuoteResponse {
  bill: BillView & {
    availablePaymentMethods: PaymentValue[];
    codUnavailableReason: 'DISABLED' | 'MEAL_PLAN' | 'ABOVE_CAP' | null;
    codMaxOrderPaise?: string;
  };
  serviceable: boolean;
  serviceabilityReason: string | null;
  walletBalancePaise: string;
  walletCovers: boolean;
  canPlaceOrder: boolean;
  cart: { itemCount: number };
}

const SLOTS: Array<{ value: SlotValue; labelKey: 'slotExpress' | 'slotMorning' | 'slotEvening' }> = [
  { value: 'EXPRESS', labelKey: 'slotExpress' },
  { value: 'MORNING_7_9', labelKey: 'slotMorning' },
  { value: 'EVENING_5_7', labelKey: 'slotEvening' },
];

/**
 * Online-payment sub-flow, entered only once `place` has created the order
 * with `paymentMethod: 'RAZORPAY'`. Mirrors `TopupSheet`'s phase machine
 * (src/components/wallet/topup-sheet.tsx) — same reasoning: the widget's
 * own success callback is never trusted (P2), so `awaiting-gateway` and
 * `polling` both just wait for OUR server to say the webhook landed.
 */
type PaymentPhase = 'idle' | 'initiating' | 'awaiting-gateway' | 'polling' | 'failed';

interface InitiateOrderPayResponse {
  paymentId: string;
  provider: string;
  gatewayOrderId: string;
  publicKey: string;
  amountPaise: string;
  currency: string;
  isMock: boolean;
}

const POLL_INTERVAL_MS = 2_000;
/** Two minutes. Past that, land on the confirmation screen anyway — the
    order already exists, and the webhook can still settle it later. */
const POLL_ATTEMPTS = 60;

export function CheckoutScreen() {
  const t = useTranslations('checkout');
  const tc = useTranslations('common');
  const ta = useTranslations('address');
  const te = useTranslations('errors');
  const tw = useTranslations('wallet');
  const locale = useLocale();
  const router = useRouter();
  const { user, defaultAddress, isLoading: sessionLoading } = useSession();

  const [pickedAddressId, setPickedAddressId] = useState<string | null>(null);
  const [addressExpanded, setAddressExpanded] = useState(false);
  const [slot, setSlot] = useState<SlotValue>('EXPRESS');
  const [payment, setPayment] = useState<PaymentValue>('WALLET');
  const [paymentPhase, setPaymentPhase] = useState<PaymentPhase>('idle');
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [mockOrderId, setMockOrderId] = useState<{ orderId: string; gatewayOrderId: string } | null>(
    null,
  );
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Derived, not synced into state: the default address is a fallback until the
  // customer picks one, and an effect that mirrors a prop into state is just a
  // second copy that can go stale.
  const addressId = pickedAddressId ?? defaultAddress?.id ?? null;
  const selectedAddress = user?.addresses.find((address) => address.id === addressId) ?? null;

  /**
   * R5 — ONE idempotency key per visit to this screen, generated on first use
   * rather than during render (a random value in render is impure, and React
   * may call render twice).
   *
   * This is the guarantee that a timed-out request the customer retries does
   * not become a second order. Leaving the screen and coming back is a genuine
   * second checkout, so it gets a fresh key.
   */
  const idempotencyKeyRef = useRef<string | null>(null);
  function idempotencyKey(): string {
    idempotencyKeyRef.current ??= `co_${Date.now().toString(36)}_${crypto.randomUUID().slice(0, 12)}`;
    return idempotencyKeyRef.current;
  }

  // Redirecting has to happen in an effect, not during render.
  useEffect(() => {
    if (!sessionLoading && !user) router.replace('/login?next=/checkout');
  }, [sessionLoading, user, router]);

  const quote = useQuery({
    queryKey: ['checkout-quote', locale, addressId],
    queryFn: () =>
      api.post<QuoteResponse>(`/api/checkout/quote${qs({ locale })}`, {
        ...(addressId ? { addressId } : {}),
      }),
    enabled: Boolean(user),
  });

  const place = useMutation({
    mutationFn: () =>
      api.post<{ orderId: string; orderNumber: string; duplicate: boolean }>(
        `/api/orders${qs({ locale })}`,
        {
          addressId,
          paymentMethod: payment,
          deliverySlot: slot,
          idempotencyKey: idempotencyKey(),
          ...(notes.trim() ? { notes: notes.trim() } : {}),
        },
      ),
    onSuccess: (data) => {
      // RAZORPAY: the order exists (paymentStatus PENDING) but nothing has
      // been paid yet — stay on this screen and open the gateway. Every
      // other method is already settled by the time the order route
      // returns (WALLET debited in the same transaction; COD needs no
      // payment yet), so those go straight to the confirmation screen.
      if (payment === 'RAZORPAY') {
        setPaymentPhase('initiating');
        payOrder.mutate(data.orderId);
        return;
      }
      router.replace(`/orders/${data.orderId}/confirmed`);
    },
    onError: (err) => {
      if (!(err instanceof ApiClientError)) {
        setError(te('generic'));
        return;
      }
      switch (err.code) {
        case 'OUT_OF_STOCK':
          setError(te('outOfStock'));
          break;
        case 'INSUFFICIENT_BALANCE':
          setError(te('insufficientBalance'));
          break;
        case 'NOT_SERVICEABLE':
          setError(t('notServiceable'));
          break;
        default:
          setError(err.message);
      }
    },
  });

  async function pollOrderPayment(orderId: string) {
    setPaymentPhase('polling');

    for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));

      try {
        const status = await api.get<{ status: 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED' }>(
          `/api/orders/${orderId}/pay/status`,
        );
        if (status.status === 'PAID') {
          router.replace(`/orders/${orderId}/confirmed`);
          return;
        }
        if (status.status === 'FAILED') {
          setPaymentPhase('failed');
          setPaymentError(tw('topupFailed'));
          return;
        }
      } catch {
        // A dropped poll is not a failed payment; keep watching.
      }
    }

    // Still pending after the poll window. The order already exists and the
    // webhook can still land later (P2) — send them to the order they can
    // already track rather than implying anything failed.
    router.replace(`/orders/${orderId}/confirmed`);
  }

  const payOrder = useMutation({
    mutationFn: (orderId: string) =>
      api.post<InitiateOrderPayResponse>(`/api/orders/${orderId}/pay/initiate`),
    onSuccess: async (data, orderId) => {
      // With PAYMENT_PROVIDER=mock there is no gateway to open — same
      // demo-mode escape hatch as the wallet top-up.
      if (data.isMock) {
        setMockOrderId({ orderId, gatewayOrderId: data.gatewayOrderId });
        setPaymentPhase('awaiting-gateway');
        return;
      }

      try {
        await openGatewayCheckout({
          gatewayOrderId: data.gatewayOrderId,
          publicKey: data.publicKey,
          amountPaise: data.amountPaise,
          currency: data.currency,
          appName: 'Get Fresh',
          description: t('title'),
          prefill: { name: user?.name ?? undefined, contact: user?.phone },
          onSuccess: () => void pollOrderPayment(orderId),
          // Dismissed, not failed — back to the payment options so the
          // same "Place order" tap re-enters this flow for the same order
          // (idempotency key unchanged, so no second order is created).
          onDismiss: () => setPaymentPhase('idle'),
          onFailure: (text) => {
            setPaymentPhase('failed');
            setPaymentError(text);
          },
        });
        setPaymentPhase('awaiting-gateway');
      } catch (error) {
        setPaymentPhase('failed');
        setPaymentError(error instanceof Error ? error.message : te('generic'));
      }
    },
    onError: () => {
      setPaymentPhase('failed');
      setPaymentError(te('generic'));
    },
  });

  const simulateOrderPayment = useMutation({
    mutationFn: () =>
      api.post('/api/dev/simulate-payment', {
        gatewayOrderId: mockOrderId?.gatewayOrderId,
        outcome: 'captured',
      }),
    onSuccess: () => {
      if (mockOrderId) void pollOrderPayment(mockOrderId.orderId);
    },
    onError: () => {
      setPaymentPhase('failed');
      setPaymentError(te('generic'));
    },
  });

  if (sessionLoading || !user) {
    return (
      <main className="pb-2">
        <div className="bg-card px-4 py-8 text-sm text-muted-foreground">{tc('loading')}</div>
      </main>
    );
  }

  const bill = quote.data?.bill;
  const methods = bill?.availablePaymentMethods ?? [];
  const walletCovers = quote.data?.walletCovers ?? false;

  const canSubmit =
    Boolean(addressId) &&
    Boolean(quote.data?.canPlaceOrder) &&
    !place.isPending &&
    paymentPhase === 'idle' &&
    (payment !== 'WALLET' || walletCovers);

  return (
    <>
      <header className="sticky top-0 z-30 flex items-center gap-2 border-b border-border bg-accent-faint px-3 py-3">
        <Link
          href="/cart"
          aria-label={tc('back')}
          className="grid size-11 shrink-0 place-items-center rounded-full"
        >
          <ChevronLeft className="size-5" aria-hidden />
        </Link>
        <h1 className="text-base font-bold">{t('title')}</h1>
      </header>

      <main className="space-y-2 pb-2">
      {/* ── Address */}
      <section className="bg-card px-4 py-4">
        <div className="flex items-start justify-between gap-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <StepBadge step={1} />
            {t('deliveryAddress')}
          </h2>
          {user.addresses.length === 0 ? (
            <Link href="/addresses" className="text-xs font-semibold text-primary">
              {t('addAddress')}
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => setAddressExpanded((open) => !open)}
              className="text-xs font-semibold text-primary"
            >
              {t('changeAddress')}
            </button>
          )}
        </div>

        {user.addresses.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">{t('noAddress')}</p>
        ) : !addressExpanded && selectedAddress ? (
          <div className="mt-3 flex gap-2 rounded-[var(--radius)] border border-primary bg-tint-green p-3">
            <MapPin className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
            <span className="min-w-0">
              <span className="block text-sm font-medium">{selectedAddress.label}</span>
              <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                {[selectedAddress.line1, selectedAddress.line2, selectedAddress.landmark]
                  .filter(Boolean)
                  .join(', ')}
                , {selectedAddress.city} — {selectedAddress.pincode}
              </span>
            </span>
          </div>
        ) : (
          <ul className="mt-3 space-y-2">
            {user.addresses.map((address) => (
              <li key={address.id}>
                <button
                  type="button"
                  onClick={() => {
                    setPickedAddressId(address.id);
                    setAddressExpanded(false);
                  }}
                  aria-pressed={addressId === address.id}
                  className={cn(
                    'flex w-full gap-2 rounded-[var(--radius)] border p-3 text-left',
                    addressId === address.id
                      ? 'border-primary bg-tint-green'
                      : 'border-border bg-background',
                  )}
                >
                  <MapPin className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">
                      {address.label}
                      {address.isDefault && (
                        <span className="ml-2 text-[10px] font-bold text-primary">
                          {ta('isDefault')}
                        </span>
                      )}
                    </span>
                    <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                      {[address.line1, address.line2, address.landmark].filter(Boolean).join(', ')},{' '}
                      {address.city} — {address.pincode}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {quote.data && !quote.data.serviceable && addressId && (
          <p className="mt-3 rounded-[var(--radius)] bg-[#FDF3E3] px-3 py-2 text-xs font-medium text-warning">
            {t('notServiceable')}
          </p>
        )}
      </section>

      {/* ── Slot */}
      <section className="bg-card px-4 py-4">
        <h2 className="text-sm font-semibold">{t('slot')}</h2>
        <div className="mt-3 grid gap-2">
          {SLOTS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setSlot(option.value)}
              aria-pressed={slot === option.value}
              className={cn(
                'flex min-h-11 items-center justify-between rounded-[var(--radius)] border px-3 text-sm',
                slot === option.value
                  ? 'border-primary bg-primary/5 font-semibold'
                  : 'border-border bg-background text-muted-foreground',
              )}
            >
              <span>{t(option.labelKey)}</span>
              {option.value === 'EXPRESS' && (
                <span className="text-[11px] text-muted-foreground">{t('slotExpressHint')}</span>
              )}
            </button>
          ))}
        </div>
      </section>

      {/* ── Payment */}
      <section className="bg-card px-4 py-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <StepBadge step={2} />
          {t('payment')}
        </h2>
        <div className="mt-3 grid gap-2">
          <PaymentOption
            icon={Wallet}
            label={t('payWallet')}
            hint={
              quote.data
                ? t('payWalletBalance', {
                    amount: formatPaise(paise(quote.data.walletBalancePaise)),
                  })
                : undefined
            }
            selected={payment === 'WALLET'}
            disabled={!walletCovers}
            disabledHint={!walletCovers ? t('payWalletShort') : undefined}
            onSelect={() => setPayment('WALLET')}
          />

          {/* P3 — Razorpay wired (session 2026-09-01). Payment happens after
              order creation, not here: see `place`'s onSuccess and
              `payOrder` below. */}
          <PaymentOption
            icon={CreditCard}
            label={t('payOnline')}
            hint={t('payOnlineHint')}
            selected={payment === 'RAZORPAY'}
            onSelect={() => setPayment('RAZORPAY')}
          />

          {/* B9 — COD for instant orders only, capped at ₹1,500. */}
          <PaymentOption
            icon={Banknote}
            label={t('payCod')}
            selected={payment === 'COD'}
            disabled={!methods.includes('COD')}
            disabledHint={
              bill?.codUnavailableReason === 'ABOVE_CAP'
                ? t('codUnavailableCap', {
                    amount: formatPaise(paise(bill.codMaxOrderPaise ?? '150000'), {
                      hidePaise: true,
                    }),
                  })
                : bill?.codUnavailableReason === 'MEAL_PLAN'
                  ? t('codUnavailablePlan')
                  : undefined
            }
            onSelect={() => setPayment('COD')}
          />
        </div>
      </section>

      {/* ── Notes */}
      <section className="bg-card px-4 py-4">
        <label htmlFor="notes" className="text-sm font-semibold">
          {t('notes')}
        </label>
        <textarea
          id="notes"
          value={notes}
          onChange={(event) => setNotes(event.target.value.slice(0, 500))}
          placeholder={t('notesPlaceholder')}
          rows={2}
          className="input-3d mt-2 w-full resize-none rounded-[var(--radius)] border border-border/60 bg-background px-3 py-2 text-sm outline-none focus:border-primary"
        />
      </section>

      {bill && (
        <div className="bg-card px-4 py-4">
          <BillSummary bill={bill} />
        </div>
      )}

      {error && (
        <div className="bg-card px-4 py-4">
          <p className="rounded-[var(--radius)] bg-danger/10 px-3 py-2.5 text-sm text-danger">
            {error}
          </p>
        </div>
      )}

      <div
        className="fixed inset-x-0 z-30 mx-auto max-w-[480px] border-t border-border bg-card px-4 py-3"
        style={{ bottom: 'calc(var(--bottom-nav-height) + env(safe-area-inset-bottom, 0px))' }}
      >
        <button
          type="button"
          onClick={() => {
            setError(null);
            place.mutate();
          }}
          disabled={!canSubmit}
          className="flex h-11 w-full items-center justify-between rounded-[var(--radius)] bg-primary px-4 text-sm font-bold text-primary-foreground disabled:opacity-50"
        >
          <span>{bill ? formatPaise(paise(bill.totalPaise)) : '—'}</span>
          <span>{place.isPending || payOrder.isPending ? t('placing') : t('placeOrder')}</span>
        </button>
      </div>

      <div aria-hidden className="h-16" />
      </main>

      {/* Online-payment overlay — same phase machine and visual language as
          TopupSheet (src/components/wallet/topup-sheet.tsx). Stays over the
          checkout screen rather than navigating away, since nothing is
          confirmed yet at this point (P2). */}
      {paymentPhase !== 'idle' && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40">
          <div className="w-full max-w-[480px] rounded-t-[calc(var(--radius)*1.6)] bg-background p-5 pb-8">
            {(paymentPhase === 'initiating' ||
              paymentPhase === 'awaiting-gateway' ||
              paymentPhase === 'polling') && (
              <div className="py-6 text-center">
                <Loader2 className="mx-auto size-8 animate-spin text-primary" aria-hidden />
                <p className="mt-3 text-sm font-medium">{tw('processing')}</p>
                <p className="mt-1 text-xs text-muted-foreground">{tw('processingHint')}</p>

                {mockOrderId && paymentPhase === 'awaiting-gateway' && (
                  <button
                    type="button"
                    onClick={() => simulateOrderPayment.mutate()}
                    disabled={simulateOrderPayment.isPending}
                    className="mt-6 h-12 w-full rounded-[var(--radius)] border border-dashed border-primary text-sm font-semibold text-primary disabled:opacity-50"
                  >
                    {tw('simulatePayment')}
                  </button>
                )}
              </div>
            )}

            {paymentPhase === 'failed' && (
              <div className="py-6 text-center">
                <p className="text-sm font-semibold text-danger">{paymentError}</p>
                <button
                  type="button"
                  onClick={() => {
                    setPaymentError(null);
                    setPaymentPhase('idle');
                  }}
                  className="mt-6 h-11 w-full rounded-[var(--radius)] bg-primary text-sm font-bold text-primary-foreground"
                >
                  {tc('retry')}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function PaymentOption({
  icon: Icon,
  label,
  hint,
  selected,
  disabled,
  disabledHint,
  onSelect,
}: {
  icon: typeof Wallet;
  label: string;
  hint?: string;
  selected: boolean;
  disabled?: boolean;
  disabledHint?: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      aria-pressed={selected}
      className={cn(
        'flex min-h-13 items-center gap-3 rounded-[var(--radius)] border px-3 text-left text-sm',
        selected && !disabled
          ? 'border-primary bg-tint-green font-semibold'
          : 'border-border bg-background',
        disabled && 'opacity-55',
      )}
    >
      <Icon className="size-5 shrink-0 text-primary" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block">{label}</span>
        {(disabled ? disabledHint : hint) && (
          <span className="block text-[11px] font-normal text-muted-foreground">
            {disabled ? disabledHint : hint}
          </span>
        )}
      </span>
      {!disabled && (
        <span
          aria-hidden
          className={cn(
            'grid size-5 shrink-0 place-items-center rounded-full border-2',
            selected ? 'border-primary' : 'border-border',
          )}
        >
          {selected && <span className="size-2.5 rounded-full bg-primary" />}
        </span>
      )}
    </button>
  );
}

/** A purely typographic echo of the reference's numbered steps — this screen
    stays one scrollable page (R5's idempotency key and the quote query both
    live for the whole visit), so the numbers order the sections rather than
    track a live wizard state. */
function StepBadge({ step }: { step: number }) {
  return (
    <span className="grid size-5 shrink-0 place-items-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">
      {step}
    </span>
  );
}
