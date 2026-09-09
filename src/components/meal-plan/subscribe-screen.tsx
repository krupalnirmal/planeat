'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Loader2, MapPin } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { PageHeader } from '@/components/shop/page-header';
import { TopupSheet } from '@/components/wallet/topup-sheet';
import { useRouter } from '@/i18n/navigation';
import { useSession } from '@/hooks/use-session';
import { ApiClientError, api, qs } from '@/lib/api/client';
import { formatPaise, paise } from '@/lib/money';
import { cn } from '@/lib/utils';

/**
 * The missing Phase 5: turning a saved "My Meal Plan" into a real
 * subscription. Everything shown here is computed server-side by
 * `getSubscriptionQuote`/`activateSubscription`
 * (`src/lib/meal-plan/subscribe.ts`) from the pure pricing math in
 * `src/lib/meal-plan/pricing.ts` — this screen only renders the numbers and
 * collects the two real choices (duration, address).
 */

const DURATION_OPTIONS = [7, 15, 30] as const;

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

interface WalletResponse {
  topupPresetsPaise: string[];
  minimumTopupPaise: string;
}

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
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, isLoggedIn, isLoading: sessionLoading, defaultAddress } = useSession();

  const [durationDays, setDurationDays] = useState<(typeof DURATION_OPTIONS)[number]>(7);
  const [addressId, setAddressId] = useState<string | null>(defaultAddress?.id ?? null);
  const [addressExpanded, setAddressExpanded] = useState(false);
  const [topupOpen, setTopupOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startDateKey = tomorrowIstDateKey();
  const resolvedAddressId = addressId ?? defaultAddress?.id ?? null;
  const selectedAddress = user?.addresses.find((address) => address.id === resolvedAddressId) ?? null;

  const quote = useQuery({
    queryKey: ['meal-plan-subscribe-quote', durationDays, startDateKey],
    queryFn: () =>
      api.get<QuoteResponse>(`/api/meal-plan/subscribe${qs({ durationDays, startDate: startDateKey })}`),
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
      router.replace('/subscription');
    },
    onError: (err) => {
      if (err instanceof ApiClientError && err.code === 'INSUFFICIENT_BALANCE') {
        setError(t('needsTopup'));
        setTopupOpen(true);
        return;
      }
      setError(err instanceof ApiClientError ? err.message : te('generic'));
    },
  });

  if (sessionLoading || (isLoggedIn && quote.isLoading)) {
    return (
      <>
        <PageHeader title={t('title')} backHref="/meal-plan" backLabel={tc('back')} />
        <main className="pb-2">
          <div className="bg-card px-4 py-8 text-sm text-muted-foreground">{tc('loading')}</div>
        </main>
      </>
    );
  }

  if (!isLoggedIn) {
    router.replace('/login?next=/meal-plan/subscribe');
    return null;
  }

  const q = quote.data?.quote;
  const shortfall = q ? paise(q.shortfallPaise) : 0n;
  const canActivate = q !== undefined && shortfall <= 0n && resolvedAddressId !== null;

  return (
    <>
      <PageHeader title={t('title')} subtitle={t('subtitle')} backHref="/meal-plan" backLabel={tc('back')} />
      <main className="space-y-2 pb-24">
        {/* ── Duration */}
        <section className="bg-card px-4 py-4">
          <h2 className="mb-2 text-sm font-bold">{t('duration')}</h2>
          <div className="grid grid-cols-3 gap-2">
            {DURATION_OPTIONS.map((days) => (
              <button
                key={days}
                type="button"
                onClick={() => setDurationDays(days)}
                aria-pressed={durationDays === days}
                className={cn(
                  'rounded-[var(--radius)] border py-2.5 text-sm font-semibold',
                  durationDays === days ? 'border-primary bg-tint-green text-primary-dark' : 'border-border',
                )}
              >
                {t('days', { count: days })}
              </button>
            ))}
          </div>
        </section>

        {/* ── Address */}
        <section className="bg-card px-4 py-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold">{t('deliverTo')}</h2>
            {(user?.addresses.length ?? 0) > 0 && (
              <button
                type="button"
                onClick={() => setAddressExpanded((open) => !open)}
                className="text-xs font-semibold text-primary"
              >
                {t('changeAddress')}
              </button>
            )}
          </div>
          {(user?.addresses.length ?? 0) === 0 ? (
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
              {user?.addresses.map((address) => (
                <li key={address.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setAddressId(address.id);
                      setAddressExpanded(false);
                    }}
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
                        {[address.line1, address.line2, address.landmark].filter(Boolean).join(', ')},{' '}
                        {address.city} — {address.pincode}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* ── Quote */}
        {q && (
          <section className="bg-card px-4 py-4">
            <h2 className="mb-3 text-sm font-bold">{t('costTitle')}</h2>
            <dl className="space-y-2 text-sm">
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
                <button
                  type="button"
                  onClick={() => setTopupOpen(true)}
                  className="ml-2 font-bold underline underline-offset-2"
                >
                  {t('topUp')}
                </button>
              </div>
            ) : (
              <p className="mt-3 flex items-center gap-1.5 text-sm text-primary">
                <Check className="size-4" aria-hidden />
                {t('walletCovered')}
              </p>
            )}
          </section>
        )}

        {error && (
          <p className="mx-4 rounded-[var(--radius)] bg-danger/10 px-3 py-2.5 text-sm text-danger">{error}</p>
        )}
      </main>

      {/* Fixed action bar, matching the checkout/variant-picker pattern of
          a bottom-pinned primary action rather than a button lost at the
          end of a scroll. */}
      <div className="fixed inset-x-0 bottom-0 border-t border-border bg-card p-4">
        <button
          type="button"
          disabled={!canActivate || activate.isPending}
          onClick={() => {
            setError(null);
            activate.mutate();
          }}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-[var(--radius)] bg-primary text-sm font-bold text-primary-foreground disabled:opacity-50"
        >
          {activate.isPending && <Loader2 className="size-4 animate-spin" aria-hidden />}
          {t('activate')}
        </button>
      </div>

      {topupOpen && wallet.data && (
        <TopupSheet
          presetsPaise={wallet.data.topupPresetsPaise}
          minimumPaise={wallet.data.minimumTopupPaise}
          onClose={() => {
            setTopupOpen(false);
            void queryClient.invalidateQueries({ queryKey: ['meal-plan-subscribe-quote'] });
          }}
        />
      )}
    </>
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
