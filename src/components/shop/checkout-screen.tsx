'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { Banknote, ChevronLeft, CreditCard, MapPin, Wallet } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { Link, useRouter } from '@/i18n/navigation';
import { BillSummary, type BillView } from '@/components/shop/bill-summary';
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

export function CheckoutScreen() {
  const t = useTranslations('checkout');
  const tc = useTranslations('common');
  const ta = useTranslations('address');
  const te = useTranslations('errors');
  const locale = useLocale();
  const router = useRouter();
  const { user, defaultAddress, isLoading: sessionLoading } = useSession();

  const [pickedAddressId, setPickedAddressId] = useState<string | null>(null);
  const [slot, setSlot] = useState<SlotValue>('EXPRESS');
  const [payment, setPayment] = useState<PaymentValue>('WALLET');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Derived, not synced into state: the default address is a fallback until the
  // customer picks one, and an effect that mirrors a prop into state is just a
  // second copy that can go stale.
  const addressId = pickedAddressId ?? defaultAddress?.id ?? null;

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
      router.replace(`/orders/${data.orderId}?placed=1`);
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

  if (sessionLoading || !user) {
    return <main className="px-4 py-8 text-sm text-muted-foreground">{tc('loading')}</main>;
  }

  const bill = quote.data?.bill;
  const methods = bill?.availablePaymentMethods ?? [];
  const walletCovers = quote.data?.walletCovers ?? false;

  const canSubmit =
    Boolean(addressId) &&
    Boolean(quote.data?.canPlaceOrder) &&
    !place.isPending &&
    (payment !== 'WALLET' || walletCovers) &&
    payment !== 'RAZORPAY';

  return (
    <main className="px-4 py-4">
      <div className="mb-4 flex items-center gap-2">
        <Link
          href="/cart"
          aria-label={tc('back')}
          className="grid size-11 shrink-0 place-items-center rounded-full"
        >
          <ChevronLeft className="size-5" aria-hidden />
        </Link>
        <h1 className="text-lg font-bold">{t('title')}</h1>
      </div>

      {/* ── Address */}
      <section className="rounded-[var(--radius)] bg-card p-4">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-sm font-semibold">{t('deliveryAddress')}</h2>
          <Link href="/addresses" className="text-xs font-semibold text-primary">
            {user.addresses.length > 0 ? t('changeAddress') : t('addAddress')}
          </Link>
        </div>

        {user.addresses.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">{t('noAddress')}</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {user.addresses.map((address) => (
              <li key={address.id}>
                <button
                  type="button"
                  onClick={() => setPickedAddressId(address.id)}
                  aria-pressed={addressId === address.id}
                  className={cn(
                    'flex w-full gap-2 rounded-[var(--radius)] border p-3 text-left',
                    addressId === address.id
                      ? 'border-primary bg-primary/5'
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
      <section className="mt-4 rounded-[var(--radius)] bg-card p-4">
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
      <section className="mt-4 rounded-[var(--radius)] bg-card p-4">
        <h2 className="text-sm font-semibold">{t('payment')}</h2>
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

          {/* P3 wires Razorpay. Showing it now as an explicitly disabled option
              is more honest than hiding it and surprising the client later. */}
          <PaymentOption
            icon={CreditCard}
            label={t('payOnline')}
            selected={payment === 'RAZORPAY'}
            disabled
            disabledHint={t('payOnlineSoon')}
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
      <section className="mt-4 rounded-[var(--radius)] bg-card p-4">
        <label htmlFor="notes" className="text-sm font-semibold">
          {t('notes')}
        </label>
        <textarea
          id="notes"
          value={notes}
          onChange={(event) => setNotes(event.target.value.slice(0, 500))}
          placeholder={t('notesPlaceholder')}
          rows={2}
          className="mt-2 w-full resize-none rounded-[var(--radius)] border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
        />
      </section>

      {bill && (
        <div className="mt-4">
          <BillSummary bill={bill} />
        </div>
      )}

      {error && (
        <p className="mt-4 rounded-[var(--radius)] bg-danger/10 px-3 py-2.5 text-sm text-danger">
          {error}
        </p>
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
          className="flex h-12 w-full items-center justify-between rounded-[var(--radius)] bg-primary px-4 text-sm font-bold text-primary-foreground disabled:opacity-50"
        >
          <span>{bill ? formatPaise(paise(bill.totalPaise)) : '—'}</span>
          <span>{place.isPending ? t('placing') : t('placeOrder')}</span>
        </button>
      </div>

      <div aria-hidden className="h-16" />
    </main>
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
        'flex min-h-12 items-center gap-3 rounded-[var(--radius)] border px-3 text-left text-sm',
        selected && !disabled
          ? 'border-primary bg-primary/5 font-semibold'
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
    </button>
  );
}
