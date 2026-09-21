'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Check,
  CheckCircle2,
  ChevronRight,
  CreditCard,
  Landmark,
  Loader2,
  MapPin,
  PartyPopper,
  ShieldCheck,
  Smartphone,
  Wallet,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Link, useRouter } from '@/i18n/navigation';
import { PageHeader } from '@/components/shop/page-header';
import { useSession } from '@/hooks/use-session';
import { ApiClientError, api, qs } from '@/lib/api/client';
import { formatPaise, paise, rupeesToPaise } from '@/lib/money';
import { cn } from '@/lib/utils';
import { openGatewayCheckout } from '@/components/wallet/gateway-checkout';
import { DURATION_OPTIONS } from '@/lib/meal-plan/pricing';

/**
 * The missing Phase 5, redesigned screen-for-screen (session 2026-09-15,
 * client reference) into a step wizard: duration → plan summary → (if short)
 * add money → payment method → payment success → activate confirmation →
 * activated. Every number is still computed server-side by
 * `getSubscriptionQuote`/`activateSubscription` (`src/lib/meal-plan/
 * subscribe.ts`) — this screen only renders them and drives the steps.
 *
 * The reference's screen 5 (a dedicated in-app "Payment Method" chooser) is
 * built even though Razorpay's own widget shows a real method picker right
 * after it — a deliberate choice, not an oversight (the alternative was
 * skipping straight to the wallet top-up sheet already used elsewhere).
 */

const MOST_POPULAR_DAYS = 15;

type Step = 'duration' | 'summary' | 'topup' | 'payment' | 'paySuccess' | 'confirm' | 'activated';

interface QuoteResponse {
  quote: {
    averageDailyPaise: string;
    estimatedPeriodCostPaise: string;
    planFee: { feePaise: string; waived: boolean; reason: 'FREE_TRIAL' | null };
    prepay: {
      estimatedPeriodCostPaise: string;
      bufferPaise: string;
      planFeePaise: string;
      requiredBalancePaise: string;
    };
    walletBalancePaise: string;
    shortfallPaise: string;
  };
}

interface PlanResponse {
  plan: { days: Array<{ items: unknown[] }> } | null;
}

interface WalletResponse {
  balancePaise: string;
  topupPresetsPaise: string[];
  minimumTopupPaise: string;
}

interface InitiateResponse {
  paymentId: string;
  gatewayOrderId: string;
  publicKey: string;
  amountPaise: string;
  currency: string;
  isMock: boolean;
}

interface TopupStatusResponse {
  status: 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED';
  balancePaise: string;
}

const POLL_INTERVAL_MS = 2_000;
const POLL_ATTEMPTS = 60;

/** Tomorrow's IST calendar date — the earliest the 00:30 cron can pick this
    subscription up. Same UTC+5:30 shift `istDateKeyOf` (server-only, pulls
    in `@/lib/env`) uses, reimplemented here since this runs client-side. */
function tomorrowIstDateKey(): string {
  const ist = new Date(Date.now() + 5.5 * 3_600_000 + 24 * 3_600_000);
  return ist.toISOString().slice(0, 10);
}

export function SubscribeScreen() {
  const t = useTranslations('mealPlan.subscribe');
  const tc = useTranslations('common');
  const te = useTranslations('errors');
  const tw = useTranslations('wallet');
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, isLoggedIn, isLoading: sessionLoading, defaultAddress } = useSession();

  const [step, setStep] = useState<Step>('duration');
  const [durationDays, setDurationDays] = useState<(typeof DURATION_OPTIONS)[number]>(7);
  const [addressId, setAddressId] = useState<string | null>(defaultAddress?.id ?? null);
  const [addressExpanded, setAddressExpanded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [topupAmountPaise, setTopupAmountPaise] = useState<string>('0');
  const [customAmount, setCustomAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'upi' | 'card' | 'netbanking' | 'wallet'>('upi');
  const [payPhase, setPayPhase] = useState<'idle' | 'awaiting' | 'polling' | 'failed'>('idle');
  const [payMessage, setPayMessage] = useState<string | null>(null);
  const [pendingPaymentId, setPendingPaymentId] = useState<string | null>(null);
  const [mockOrderId, setMockOrderId] = useState<string | null>(null);

  const startDateKey = tomorrowIstDateKey();
  const resolvedAddressId = addressId ?? defaultAddress?.id ?? null;
  const selectedAddress = user?.addresses.find((address) => address.id === resolvedAddressId) ?? null;

  const quote = useQuery({
    queryKey: ['meal-plan-subscribe-quote', durationDays, startDateKey],
    queryFn: () =>
      api.get<QuoteResponse>(`/api/meal-plan/subscribe${qs({ durationDays, startDate: startDateKey })}`),
    enabled: isLoggedIn,
  });

  const plan = useQuery({
    queryKey: ['meal-plan-current'],
    queryFn: () => api.get<PlanResponse>('/api/meal-plan/current'),
    enabled: isLoggedIn,
  });

  const wallet = useQuery({
    queryKey: ['wallet'],
    queryFn: () => api.get<WalletResponse>('/api/wallet'),
    enabled: isLoggedIn,
  });

  const activate = useMutation({
    mutationFn: () =>
      api.post<{ subscriptionId: string }>('/api/meal-plan/subscribe', {
        addressId: resolvedAddressId,
        durationDays,
        startDate: startDateKey,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['meal-plan-current'] });
      void queryClient.invalidateQueries({ queryKey: ['subscription-current'] });
      setStep('activated');
    },
    onError: (err) => {
      if (err instanceof ApiClientError && err.code === 'INSUFFICIENT_BALANCE') {
        setError(t('needsTopup'));
        setStep('topup');
        return;
      }
      setError(err instanceof ApiClientError ? err.message : te('generic'));
    },
  });

  const q = quote.data?.quote;
  const shortfall = q ? paise(q.shortfallPaise) : 0n;
  const itemCount = (plan.data?.plan?.days ?? []).reduce((sum, day) => sum + day.items.length, 0);

  function finishTopup(status: TopupStatusResponse['status']) {
    void queryClient.invalidateQueries({ queryKey: ['wallet'] });
    void queryClient.invalidateQueries({ queryKey: ['meal-plan-subscribe-quote'] });
    if (status === 'PAID') {
      setPayPhase('idle');
      setStep('paySuccess');
    } else if (status === 'FAILED') {
      setPayPhase('failed');
      setPayMessage(tw('topupFailed'));
    } else {
      // Still pending after the poll window — not a failure, just slow.
      setPayPhase('failed');
      setPayMessage(tw('topupPending'));
    }
  }

  async function pollUntilSettled(paymentId: string) {
    setPayPhase('polling');
    for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      try {
        const status = await api.get<TopupStatusResponse>(`/api/wallet/topup/status${qs({ paymentId })}`);
        if (status.status !== 'PENDING') {
          finishTopup(status.status);
          return;
        }
      } catch {
        // A dropped poll is not a failed payment; keep watching.
      }
    }
    finishTopup('PENDING');
  }

  const initiate = useMutation({
    mutationFn: () => api.post<InitiateResponse>('/api/wallet/topup/initiate', { amountPaise: Number(topupAmountPaise) }),
    onSuccess: async (data) => {
      setPendingPaymentId(data.paymentId);
      if (data.isMock) {
        setMockOrderId(data.gatewayOrderId);
        setPayPhase('awaiting');
        return;
      }
      try {
        await openGatewayCheckout({
          gatewayOrderId: data.gatewayOrderId,
          publicKey: data.publicKey,
          amountPaise: data.amountPaise,
          currency: data.currency,
          appName: 'Get Freesh',
          description: t('title'),
          prefill: { name: user?.name ?? undefined, contact: user?.phone },
          onSuccess: () => void pollUntilSettled(data.paymentId),
          onDismiss: () => setPayPhase('idle'),
          onFailure: (text) => {
            setPayPhase('failed');
            setPayMessage(text);
          },
        });
        setPayPhase('awaiting');
      } catch (err) {
        setPayPhase('failed');
        setPayMessage(err instanceof Error ? err.message : te('generic'));
      }
    },
    onError: () => {
      setPayPhase('failed');
      setPayMessage(te('generic'));
    },
  });

  const simulate = useMutation({
    mutationFn: () => api.post('/api/dev/simulate-payment', { gatewayOrderId: mockOrderId, outcome: 'captured' }),
    onSuccess: () => {
      if (pendingPaymentId) void pollUntilSettled(pendingPaymentId);
    },
    onError: () => {
      setPayPhase('failed');
      setPayMessage(te('generic'));
    },
  });

  if (sessionLoading || (isLoggedIn && (quote.isLoading || plan.isLoading))) {
    return (
      <>
        <PageHeader title={t('title')} backHref="/meal-plan" backLabel={tc('back')} />
        <main className="px-4 py-8 text-sm text-muted-foreground">{tc('loading')}</main>
      </>
    );
  }

  if (!isLoggedIn) {
    router.replace('/login?next=/meal-plan/subscribe');
    return null;
  }

  return (
    <>
      <PageHeader
        title={t('title')}
        subtitle={STEP_SUBTITLE(t, step)}
        backHref={step === 'duration' ? '/meal-plan' : undefined}
        backLabel={tc('back')}
        trailing={
          step !== 'duration' && step !== 'activated' ? (
            <button
              type="button"
              onClick={() => setStep(prevStep(step))}
              className="text-xs font-semibold text-primary"
            >
              {tc('back')}
            </button>
          ) : undefined
        }
      />

      <main className="space-y-2 pb-24 lg:mx-auto lg:max-w-2xl">
        {error && step !== 'topup' && (
          <p className="mx-4 mt-3 rounded-[var(--radius)] bg-danger/10 px-3 py-2.5 text-sm text-danger">{error}</p>
        )}

        {step === 'duration' && (
          <DurationStep
            q={q}
            durationDays={durationDays}
            setDurationDays={setDurationDays}
            onContinue={() => setStep('summary')}
          />
        )}

        {step === 'summary' && q && (
          <SummaryStep
            q={q}
            durationDays={durationDays}
            itemCount={itemCount}
            shortfall={shortfall}
            selectedAddress={selectedAddress}
            addresses={user?.addresses ?? []}
            addressExpanded={addressExpanded}
            resolvedAddressId={resolvedAddressId}
            onExpandAddress={() => setAddressExpanded((v) => !v)}
            onPickAddress={(id) => {
              setAddressId(id);
              setAddressExpanded(false);
            }}
            onNeedsTopup={() => {
              const suggested = shortfall > 0n ? shortfall.toString() : (wallet.data?.topupPresetsPaise[0] ?? '50000');
              setTopupAmountPaise(suggested);
              setStep('topup');
            }}
            onContinue={() => setStep('confirm')}
            canContinue={resolvedAddressId !== null && shortfall <= 0n}
          />
        )}

        {step === 'topup' && wallet.data && (
          <TopupStep
            wallet={wallet.data}
            amountPaise={topupAmountPaise}
            setAmountPaise={setTopupAmountPaise}
            customAmount={customAmount}
            setCustomAmount={setCustomAmount}
            onContinue={() => setStep('payment')}
          />
        )}

        {step === 'payment' && (
          <PaymentMethodStep
            amountPaise={topupAmountPaise}
            method={paymentMethod}
            setMethod={setPaymentMethod}
            phase={payPhase}
            message={payMessage}
            mockMode={mockOrderId !== null}
            onPay={() => {
              setPayMessage(null);
              initiate.mutate();
            }}
            onSimulate={() => simulate.mutate()}
            paying={initiate.isPending || simulate.isPending}
          />
        )}

        {step === 'paySuccess' && wallet.data && (
          <PaySuccessStep
            amountPaise={topupAmountPaise}
            balancePaise={quote.data?.quote.walletBalancePaise ?? wallet.data.balancePaise}
            onContinue={() => setStep('confirm')}
          />
        )}

        {step === 'confirm' && q && (
          <ConfirmStep
            q={q}
            durationDays={durationDays}
            error={error}
            onActivate={() => {
              setError(null);
              activate.mutate();
            }}
            activating={activate.isPending}
          />
        )}

        {step === 'activated' && <ActivatedStep durationDays={durationDays} />}
      </main>
    </>
  );
}

function STEP_SUBTITLE(t: ReturnType<typeof useTranslations<'mealPlan.subscribe'>>, step: Step): string {
  switch (step) {
    case 'duration':
      return t('stepDuration');
    case 'summary':
      return t('stepSummary');
    case 'topup':
      return t('stepTopup');
    case 'payment':
      return t('stepPayment');
    case 'paySuccess':
      return t('stepPaySuccess');
    case 'confirm':
      return t('stepConfirm');
    default:
      return '';
  }
}

function prevStep(step: Step): Step {
  switch (step) {
    case 'summary':
      return 'duration';
    case 'topup':
      return 'summary';
    case 'payment':
      return 'topup';
    case 'paySuccess':
      return 'payment';
    case 'confirm':
      return 'summary';
    default:
      return 'duration';
  }
}

function DurationStep({
  q,
  durationDays,
  setDurationDays,
  onContinue,
}: {
  q: QuoteResponse['quote'] | undefined;
  durationDays: (typeof DURATION_OPTIONS)[number];
  setDurationDays: (d: (typeof DURATION_OPTIONS)[number]) => void;
  onContinue: () => void;
}) {
  const t = useTranslations('mealPlan.subscribe');

  return (
    <div className="space-y-3 px-4 pt-3">
      {DURATION_OPTIONS.map((days) => {
        const active = durationDays === days;
        const estimatedTotal = q ? paise(q.averageDailyPaise) * BigInt(days) : 0n;
        return (
          <button
            key={days}
            type="button"
            onClick={() => setDurationDays(days)}
            aria-pressed={active}
            className={cn(
              'relative w-full rounded-[var(--radius-2xl)] border-2 p-4 text-left',
              active ? 'border-primary bg-tint-green' : 'border-border bg-card',
            )}
          >
            {days === MOST_POPULAR_DAYS && (
              <span className="absolute -top-2.5 right-4 rounded-full bg-primary px-2.5 py-0.5 text-[10px] font-bold text-primary-foreground">
                {t('mostPopular')}
              </span>
            )}
            <div className="flex items-center justify-between">
              <span className="text-base font-bold">{t('days', { count: days })}</span>
              <span className="text-base font-black">{formatPaise(estimatedTotal, { hidePaise: true })}</span>
            </div>
            {q && (
              <p className="mt-0.5 text-xs text-muted-foreground">
                ({formatPaise(paise(q.averageDailyPaise))}/{t('day')})
              </p>
            )}
          </button>
        );
      })}

      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <ShieldCheck className="size-3.5 shrink-0" aria-hidden />
        {t('durationHint')}
      </p>

      <div
        className="fixed inset-x-0 z-30 mx-auto max-w-[480px] px-16 py-4"
        style={{ bottom: 'calc(var(--bottom-nav-height) + env(safe-area-inset-bottom, 0px))' }}
      >
        <button
          type="button"
          onClick={onContinue}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-primary text-sm font-bold text-primary-foreground"
        >
          {t('viewPlanDetails')}
          <ChevronRight className="size-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}

function SummaryStep({
  q,
  durationDays,
  itemCount,
  shortfall,
  selectedAddress,
  addresses,
  addressExpanded,
  resolvedAddressId,
  onExpandAddress,
  onPickAddress,
  onNeedsTopup,
  onContinue,
  canContinue,
}: {
  q: QuoteResponse['quote'];
  durationDays: number;
  itemCount: number;
  shortfall: bigint;
  selectedAddress: { id: string; label: string; line1: string; line2: string | null; landmark: string | null; city: string; pincode: string } | null;
  addresses: Array<{ id: string; label: string; line1: string; line2: string | null; landmark: string | null; city: string; pincode: string }>;
  addressExpanded: boolean;
  resolvedAddressId: string | null;
  onExpandAddress: () => void;
  onPickAddress: (id: string) => void;
  onNeedsTopup: () => void;
  onContinue: () => void;
  canContinue: boolean;
}) {
  const t = useTranslations('mealPlan.subscribe');

  return (
    <div className="space-y-2 px-0">
      <section className="bg-card px-4 py-4">
        <h2 className="mb-3 text-sm font-bold">{t('costTitle')}</h2>
        <dl className="space-y-2 text-sm">
          <Row label={t('totalDays')} value={t('days', { count: durationDays })} />
          <Row label={t('totalItems')} value={t('itemsCount', { count: itemCount })} />
          <Row label={t('averageDaily')} value={formatPaise(paise(q.averageDailyPaise))} />
          <Row
            label={t('estimatedTotal', { days: durationDays })}
            value={formatPaise(paise(q.estimatedPeriodCostPaise))}
          />
          <Row
            label={t('planFee')}
            value={
              q.planFee.waived ? (
                <span className="font-bold text-primary">{t('freeTrial')}</span>
              ) : (
                formatPaise(paise(q.planFee.feePaise))
              )
            }
          />
          <Row label={t('deliveryCharges')} value={<span className="font-bold text-primary">{t('free')}</span>} />
          <Row label={t('buffer')} value={formatPaise(paise(q.prepay.bufferPaise))} hint={t('bufferHint')} />
          <div className="flex justify-between border-t border-border pt-2 text-sm font-bold">
            <dt>{t('requiredBalance')}</dt>
            <dd>{formatPaise(paise(q.prepay.requiredBalancePaise))}</dd>
          </div>
          <Row label={t('walletBalance')} value={formatPaise(paise(q.walletBalancePaise))} />
        </dl>

        {shortfall > 0n ? (
          <div className="mt-3 rounded-[var(--radius)] bg-[#FDF3E3] px-3 py-2.5 text-sm text-warning">
            {t('shortfall', { amount: formatPaise(shortfall) })}
          </div>
        ) : (
          <p className="mt-3 flex items-center gap-1.5 text-sm text-primary">
            <Check className="size-4" aria-hidden />
            {t('walletCovered')}
          </p>
        )}
      </section>

      <section className="bg-card px-4 py-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold">{t('deliverTo')}</h2>
          {addresses.length > 0 && (
            <button type="button" onClick={onExpandAddress} className="text-xs font-semibold text-primary">
              {t('changeAddress')}
            </button>
          )}
        </div>
        {addresses.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">{t('noAddress')}</p>
        ) : !addressExpanded && selectedAddress ? (
          <div className="mt-3 flex gap-2 rounded-[var(--radius)] border border-primary bg-tint-green p-3">
            <MapPin className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
            <span className="min-w-0">
              <span className="block text-sm font-medium">{selectedAddress.label}</span>
              <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                {[selectedAddress.line1, selectedAddress.line2, selectedAddress.landmark].filter(Boolean).join(', ')},{' '}
                {selectedAddress.city} — {selectedAddress.pincode}
              </span>
            </span>
          </div>
        ) : (
          <ul className="mt-3 space-y-2">
            {addresses.map((address) => (
              <li key={address.id}>
                <button
                  type="button"
                  onClick={() => onPickAddress(address.id)}
                  aria-pressed={resolvedAddressId === address.id}
                  className={cn(
                    'flex w-full gap-2 rounded-[var(--radius)] border p-3 text-left',
                    resolvedAddressId === address.id ? 'border-primary bg-tint-green' : 'border-border',
                  )}
                >
                  <MapPin className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{address.label}</span>
                    <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                      {[address.line1, address.line2, address.landmark].filter(Boolean).join(', ')}, {address.city} —{' '}
                      {address.pincode}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div
        className="fixed inset-x-0 z-30 mx-auto max-w-[480px] px-16 py-4"
        style={{ bottom: 'calc(var(--bottom-nav-height) + env(safe-area-inset-bottom, 0px))' }}
      >
        <button
          type="button"
          onClick={shortfall > 0n ? onNeedsTopup : onContinue}
          disabled={!canContinue && shortfall <= 0n}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-primary text-sm font-bold text-primary-foreground disabled:opacity-50"
        >
          {shortfall > 0n ? t('addMoneyToWallet') : t('continueToActivate')}
        </button>
      </div>
    </div>
  );
}

function TopupStep({
  wallet,
  amountPaise,
  setAmountPaise,
  customAmount,
  setCustomAmount,
  onContinue,
}: {
  wallet: WalletResponse;
  amountPaise: string;
  setAmountPaise: (v: string) => void;
  customAmount: string;
  setCustomAmount: (v: string) => void;
  onContinue: () => void;
}) {
  const t = useTranslations('mealPlan.subscribe');
  const tw = useTranslations('wallet');

  const effectiveAmount = customAmount.trim() ? rupeesToPaise(customAmount) : paise(amountPaise);
  const minimum = paise(wallet.minimumTopupPaise);
  const belowMinimum = effectiveAmount < minimum;

  return (
    <div className="space-y-4 px-4 pt-3">
      <section className="rounded-[var(--radius-2xl)] bg-tint-green p-4">
        <p className="text-xs font-semibold text-primary-dark">{t('currentBalance')}</p>
        <p className="mt-1 text-2xl font-black">{formatPaise(paise(wallet.balancePaise))}</p>
      </section>

      <div>
        <p className="mb-2 text-sm font-semibold">{t('addAmount')}</p>
        <div className="grid grid-cols-3 gap-2">
          {wallet.topupPresetsPaise.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => {
                setAmountPaise(preset);
                setCustomAmount('');
              }}
              aria-pressed={!customAmount && amountPaise === preset}
              className={cn(
                'min-h-12 rounded-[var(--radius)] border text-sm font-semibold',
                !customAmount && amountPaise === preset
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-card',
              )}
            >
              {formatPaise(paise(preset), { hidePaise: true })}
            </button>
          ))}
        </div>

        <label htmlFor="topup-other-amount" className="mt-4 block text-sm font-medium">
          {tw('customAmount')}
        </label>
        <div className="mt-1.5 flex items-center gap-2 rounded-[var(--radius)] border border-border bg-card px-3">
          <span className="text-sm text-muted-foreground">₹</span>
          <input
            id="topup-other-amount"
            inputMode="decimal"
            value={customAmount}
            onChange={(event) => setCustomAmount(event.target.value.replace(/[^\d.]/g, ''))}
            className="h-12 min-w-0 flex-1 bg-transparent text-base outline-none"
          />
        </div>
        {belowMinimum && (
          <p className="mt-2 text-xs text-warning">
            {tw('minimumTopup', { amount: formatPaise(minimum, { hidePaise: true }) })}
          </p>
        )}
      </div>

      <div
        className="fixed inset-x-0 z-30 mx-auto max-w-[480px] px-16 py-4"
        style={{ bottom: 'calc(var(--bottom-nav-height) + env(safe-area-inset-bottom, 0px))' }}
      >
        <button
          type="button"
          disabled={belowMinimum}
          onClick={() => {
            setAmountPaise(effectiveAmount.toString());
            onContinue();
          }}
          className="flex h-12 w-full items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground disabled:opacity-50"
        >
          {t('proceedToAddMoney')}
        </button>
      </div>
    </div>
  );
}

const PAYMENT_METHODS = [
  { id: 'upi' as const, icon: Smartphone },
  { id: 'card' as const, icon: CreditCard },
  { id: 'netbanking' as const, icon: Landmark },
  { id: 'wallet' as const, icon: Wallet },
];

function PaymentMethodStep({
  amountPaise,
  method,
  setMethod,
  phase,
  message,
  mockMode,
  onPay,
  onSimulate,
  paying,
}: {
  amountPaise: string;
  method: 'upi' | 'card' | 'netbanking' | 'wallet';
  setMethod: (m: 'upi' | 'card' | 'netbanking' | 'wallet') => void;
  phase: 'idle' | 'awaiting' | 'polling' | 'failed';
  message: string | null;
  mockMode: boolean;
  onPay: () => void;
  onSimulate: () => void;
  paying: boolean;
}) {
  const t = useTranslations('mealPlan.subscribe');

  if (phase === 'awaiting' || phase === 'polling') {
    return (
      <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
        <Loader2 className="size-8 animate-spin text-primary" aria-hidden />
        <p className="text-sm font-medium">{t('processingPayment')}</p>
        {mockMode && phase === 'awaiting' && (
          <button
            type="button"
            onClick={onSimulate}
            className="mt-4 h-12 w-full max-w-xs rounded-[var(--radius)] border border-dashed border-primary text-sm font-semibold text-primary"
          >
            {t('simulatePayment')}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4 px-4 pt-3">
      {phase === 'failed' && message && (
        <p className="rounded-[var(--radius)] bg-danger/10 px-3 py-2.5 text-sm text-danger">{message}</p>
      )}

      <p className="text-sm font-semibold">{t('paymentMethod')}</p>
      <ul className="divide-y divide-border overflow-hidden rounded-[var(--radius-2xl)] border border-border bg-card">
        {PAYMENT_METHODS.map(({ id, icon: Icon }) => (
          <li key={id}>
            <button
              type="button"
              onClick={() => setMethod(id)}
              className="flex w-full items-center justify-between gap-3 px-4 py-3.5"
            >
              <span className="flex items-center gap-3">
                <Icon className="size-4 text-muted-foreground" aria-hidden />
                <span className="text-sm font-medium">{t(`method.${id}`)}</span>
              </span>
              <span
                className={cn(
                  'grid size-5 place-items-center rounded-full border-2',
                  method === id ? 'border-primary bg-primary' : 'border-border',
                )}
              >
                {method === id && <span className="size-2 rounded-full bg-primary-foreground" />}
              </span>
            </button>
          </li>
        ))}
      </ul>

      <div className="flex items-center justify-between rounded-[var(--radius)] bg-secondary px-4 py-3 text-sm">
        <span className="font-semibold text-muted-foreground">{t('amountToAdd')}</span>
        <span className="text-base font-black">{formatPaise(paise(amountPaise))}</span>
      </div>

      <div
        className="fixed inset-x-0 z-30 mx-auto max-w-[480px] px-16 py-4"
        style={{ bottom: 'calc(var(--bottom-nav-height) + env(safe-area-inset-bottom, 0px))' }}
      >
        <button
          type="button"
          disabled={paying}
          onClick={onPay}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-primary text-sm font-bold text-primary-foreground disabled:opacity-50"
        >
          {paying && <Loader2 className="size-4 animate-spin" aria-hidden />}
          {t('pay', { amount: formatPaise(paise(amountPaise), { hidePaise: true }) })}
        </button>
        <p className="mt-2 flex items-center justify-center gap-1 text-[11px] text-muted-foreground">
          <ShieldCheck className="size-3" aria-hidden />
          {t('securePayment')}
        </p>
      </div>
    </div>
  );
}

function PaySuccessStep({
  amountPaise,
  balancePaise,
  onContinue,
}: {
  amountPaise: string;
  balancePaise: string;
  onContinue: () => void;
}) {
  const t = useTranslations('mealPlan.subscribe');

  return (
    <div className="flex flex-col items-center gap-4 px-6 py-14 text-center">
      <span className="grid size-20 place-items-center rounded-full bg-success/10 text-success">
        <CheckCircle2 className="size-10" aria-hidden />
      </span>
      <h1 className="text-xl font-black">{t('paymentSuccessTitle')}</h1>
      <p className="text-sm text-muted-foreground">
        {t('paymentSuccessSubtitle', { amount: formatPaise(paise(amountPaise)) })}
      </p>

      <div className="w-full rounded-[var(--radius)] bg-tint-green px-4 py-3">
        <p className="text-xs font-semibold text-primary-dark">{t('currentBalance')}</p>
        <p className="text-lg font-black">{formatPaise(paise(balancePaise))}</p>
      </div>

      <button
        type="button"
        onClick={onContinue}
        className="mt-2 flex h-12 w-full items-center justify-center rounded-[var(--radius)] bg-primary text-sm font-bold text-primary-foreground"
      >
        {t('continueToActivate')}
      </button>
    </div>
  );
}

function ConfirmStep({
  q,
  durationDays,
  error,
  onActivate,
  activating,
}: {
  q: QuoteResponse['quote'];
  durationDays: number;
  error: string | null;
  onActivate: () => void;
  activating: boolean;
}) {
  const t = useTranslations('mealPlan.subscribe');

  return (
    <div className="space-y-4 px-4 pt-3">
      <section className="rounded-[var(--radius-2xl)] bg-card p-4 ring-1 ring-border">
        <div className="flex items-center justify-between">
          <span className="text-sm font-bold">{t('days', { count: durationDays })}</span>
          <span className="text-base font-black">{formatPaise(paise(q.prepay.requiredBalancePaise))}</span>
        </div>
      </section>

      <section className="rounded-[var(--radius)] bg-tint-green px-4 py-3">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-primary-dark">
          <Wallet className="size-4" aria-hidden />
          {t('walletBalance')}: {formatPaise(paise(q.walletBalancePaise))}
        </p>
        <p className="mt-0.5 text-xs text-primary-dark">{t('sufficientBalance')}</p>
      </section>

      <div>
        <p className="mb-2 text-sm font-semibold">{t('whatHappensNext')}</p>
        <ul className="space-y-2">
          {(['next1', 'next2', 'next3', 'next4'] as const).map((key) => (
            <li key={key} className="flex items-start gap-2 text-sm text-muted-foreground">
              <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
              {t(key)}
            </li>
          ))}
        </ul>
      </div>

      {error && <p className="rounded-[var(--radius)] bg-danger/10 px-3 py-2.5 text-sm text-danger">{error}</p>}

      <div
        className="fixed inset-x-0 z-30 mx-auto max-w-[480px] px-16 py-4"
        style={{ bottom: 'calc(var(--bottom-nav-height) + env(safe-area-inset-bottom, 0px))' }}
      >
        <button
          type="button"
          disabled={activating}
          onClick={onActivate}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-primary text-sm font-bold text-primary-foreground disabled:opacity-50"
        >
          {activating && <Loader2 className="size-4 animate-spin" aria-hidden />}
          {t('activate')}
        </button>
      </div>
    </div>
  );
}

function ActivatedStep({ durationDays }: { durationDays: number }) {
  const t = useTranslations('mealPlan.subscribe');

  return (
    <div className="flex flex-col items-center gap-4 px-6 py-14 text-center">
      <span className="grid size-20 place-items-center rounded-full bg-success/10 text-success">
        <PartyPopper className="size-10" aria-hidden />
      </span>
      <h1 className="text-xl font-black">{t('activatedTitle')}</h1>
      <p className="text-sm text-muted-foreground">{t('activatedSubtitle', { count: durationDays })}</p>

      <Link
        href="/subscription"
        className="mt-2 flex h-12 w-full items-center justify-center rounded-[var(--radius)] bg-primary text-sm font-bold text-primary-foreground"
      >
        {t('viewMyPlan')}
      </Link>
      <Link
        href="/orders"
        className="flex h-12 w-full items-center justify-center rounded-[var(--radius)] border border-border text-sm font-bold"
      >
        {t('trackOrders')}
      </Link>
    </div>
  );
}

function Row({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between">
      <dt className="text-muted-foreground">
        {label}
        {hint && <span className="ml-1 text-[11px]">({hint})</span>}
      </dt>
      <dd>{value}</dd>
    </div>
  );
}
