'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, CheckCircle2, ChevronLeft, Loader2, MapPin, Truck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Link } from '@/i18n/navigation';
import { TopupSheet } from '@/components/wallet/topup-sheet';
import { useSession } from '@/hooks/use-session';
import { ApiClientError, api, qs } from '@/lib/api/client';
import { formatPaise, paise } from '@/lib/money';
import { cn } from '@/lib/utils';

/**
 * M5 approval: duration, start date, slot, address → cost → prepay → subscribe.
 *
 * B2 requires this screen to show the estimated daily cost, the estimated
 * period total, the plan fee, and a clear "prices vary daily with market rates"
 * line. All four are here, and the last one is not fine print — it is the
 * sentence that stops a customer feeling cheated the first week tomatoes spike.
 *
 * B3 — a short balance is not a dead end. The exact shortfall opens the top-up
 * sheet, and the quote refetches when it closes.
 */

interface Quote {
  durationDays: number;
  startDate: string;
  endDate: string;
  estimatedDailyCostPaise: string;
  estimatedPeriodCostPaise: string;
  bufferPaise: string;
  planFeePaise: string;
  planFeeWaived: boolean;
  requiredBalancePaise: string;
  walletBalancePaise: string;
  shortfallPaise: string;
  canApprove: boolean;
  isFirstPlan: boolean;
  durationOptions: number[];
}

interface WalletResponse {
  topupPresetsPaise: string[];
  minimumTopupPaise: string;
}

const BUFFER_PERCENT = 15;

export function ApprovalScreen({ mealPlanId }: { mealPlanId: string }) {
  const t = useTranslations('approval');
  const tm = useTranslations('mealPlan');
  const tc = useTranslations('common');
  const ta = useTranslations('address');
  const queryClient = useQueryClient();
  const { user, defaultAddress, isLoading: sessionLoading } = useSession();

  const [durationDays, setDurationDays] = useState<number | null>(null);
  const [startDate, setStartDate] = useState<string | null>(null);
  const [pickedAddressId, setPickedAddressId] = useState<string | null>(null);
  const [topupOpen, setTopupOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ startDate: string } | null>(null);

  const addressId = pickedAddressId ?? defaultAddress?.id ?? null;

  const quote = useQuery({
    queryKey: ['approval-quote', mealPlanId, durationDays, startDate],
    queryFn: () =>
      api.get<Quote>(
        `/api/meal-plan/${mealPlanId}/approve${qs({
          durationDays: durationDays ?? undefined,
          startDate: startDate ?? undefined,
        })}`,
      ),
  });

  const wallet = useQuery({
    queryKey: ['wallet'],
    queryFn: () => api.get<WalletResponse>('/api/wallet'),
  });

  const approve = useMutation({
    mutationFn: () =>
      api.post<{ subscriptionId: string; startDate: string }>(
        `/api/meal-plan/${mealPlanId}/approve`,
        {
          addressId,
          durationDays: quote.data?.durationDays,
          startDate: quote.data?.startDate,
        },
      ),
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: ['meal-plan-current'] });
      void queryClient.invalidateQueries({ queryKey: ['wallet'] });
      setDone({ startDate: data.startDate ?? quote.data?.startDate ?? '' });
    },
    onError: (err) => {
      if (err instanceof ApiClientError) {
        if (err.code === 'INSUFFICIENT_BALANCE') {
          // B3 — route to top-up for the difference, then return here.
          setTopupOpen(true);
          return;
        }
        if (err.code === 'CONFLICT') {
          setError(t('incomplete'));
          return;
        }
      }
      setError(t('failed'));
    },
  });

  if (sessionLoading || quote.isLoading) {
    return (
      <main className="pb-2">
        <div className="bg-card px-4 py-8 text-sm text-muted-foreground">{tc('loading')}</div>
      </main>
    );
  }

  if (done) {
    return (
      <main className="pb-2">
        <div className="bg-card px-6 py-20 text-center">
          <CheckCircle2 className="mx-auto size-14 text-success" aria-hidden />
          <h1 className="mt-4 text-lg font-bold">{t('successTitle')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('successBody', { date: done.startDate })}
          </p>
          <Link
            href="/meal-plan"
            className="mt-8 flex h-12 items-center justify-center rounded-[var(--radius)] bg-primary text-sm font-bold text-primary-foreground"
          >
            {t('viewPlan')}
          </Link>
        </div>
      </main>
    );
  }

  const data = quote.data;
  if (!data) {
    return (
      <main className="pb-2">
        <div className="bg-card px-4 py-8 text-sm text-danger">{tm('generateFailed')}</div>
      </main>
    );
  }

  const shortfall = paise(data.shortfallPaise);
  const hasAddress = (user?.addresses.length ?? 0) > 0;
  // Approving can fail with INSUFFICIENT_BALANCE, which opens the top-up
  // sheet from `wallet.data` (B3) — that must already be loaded, or the
  // sheet silently fails to render and the customer sees nothing happen.
  const canSubmit =
    data.canApprove && hasAddress && Boolean(addressId) && !approve.isPending && Boolean(wallet.data);

  return (
    <>
      <header className="sticky top-0 z-30 flex items-center gap-2 border-b border-border bg-card px-3 py-3">
        <Link
          href="/meal-plan"
          aria-label={tc('back')}
          className="grid size-11 shrink-0 place-items-center rounded-full"
        >
          <ChevronLeft className="size-5" aria-hidden />
        </Link>
        <h1 className="text-base font-bold">{t('title')}</h1>
      </header>

      <main className="space-y-2 pb-2">
      {/* ── B5: 7 / 15 / 30 days. First plan defaults to the free trial. */}
      <section className="bg-card px-4 py-4">
        <h2 className="text-sm font-semibold">{t('duration')}</h2>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {data.durationOptions.map((option) => {
            const selected = data.durationDays === option;
            const isTrial = data.isFirstPlan && option === 7;
            return (
              <button
                key={option}
                type="button"
                onClick={() => setDurationDays(option)}
                aria-pressed={selected}
                className={cn(
                  'min-h-14 rounded-[var(--radius)] border px-2 text-sm transition-colors',
                  selected
                    ? 'border-primary bg-primary/5 font-semibold text-primary'
                    : 'border-border bg-background text-muted-foreground',
                )}
              >
                <span className="block">{t('durationDays', { days: option })}</span>
                {isTrial && (
                  <span className="mt-0.5 block text-[10px] font-bold text-success">
                    {t('trialBadge')}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <label htmlFor="start-date" className="mt-4 block text-sm font-semibold">
          {t('startDate')}
        </label>
        <div className="input-3d mt-1.5 flex items-center gap-2 rounded-[var(--radius)] border border-border/60 bg-background px-3">
          <CalendarDays className="size-4 shrink-0 text-primary" aria-hidden />
          <input
            id="start-date"
            type="date"
            value={data.startDate}
            min={data.startDate}
            onChange={(event) => setStartDate(event.target.value)}
            className="h-12 min-w-0 flex-1 bg-transparent text-base outline-none"
          />
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">
          {data.startDate} → {data.endDate}
        </p>
      </section>

      {/* ── B1: one delivery per day, both meals together. */}
      <section className="flex items-start gap-3 bg-card px-4 py-4">
        <Truck className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
        <div>
          <p className="text-sm font-semibold">{t('slot')}</p>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{t('slotHint')}</p>
        </div>
      </section>

      {/* ── Address */}
      <section className="bg-card px-4 py-4">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-sm font-semibold">{t('address')}</h2>
          <Link href="/addresses" className="text-xs font-semibold text-primary">
            {hasAddress ? ta('edit') : ta('add')}
          </Link>
        </div>

        {!hasAddress ? (
          <p className="mt-2 text-sm text-warning">{t('noAddress')}</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {user?.addresses.map((address) => (
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
                    <span className="block text-sm font-medium">{address.label}</span>
                    <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                      {[address.line1, address.line2].filter(Boolean).join(', ')}, {address.city} —{' '}
                      {address.pincode}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── B2: the four things this screen must show. */}
      <section className="bg-card px-4 py-4">
        <h2 className="mb-3 text-sm font-semibold">{t('costTitle')}</h2>

        <dl className="space-y-2 text-sm">
          <Row
            label={t('dailyCost')}
            value={formatPaise(paise(data.estimatedDailyCostPaise))}
          />
          <Row
            label={t('periodCost', { days: data.durationDays })}
            value={formatPaise(paise(data.estimatedPeriodCostPaise))}
          />
          <Row
            label={t('buffer', { percent: BUFFER_PERCENT })}
            value={formatPaise(paise(data.bufferPaise))}
            muted
          />
          <Row
            label={t('planFee')}
            value={data.planFeeWaived ? t('planFeeFree') : formatPaise(paise(data.planFeePaise))}
            highlight={data.planFeeWaived}
          />

          <div className="flex justify-between border-t border-border pt-2.5 text-base font-bold">
            <dt>{t('required')}</dt>
            <dd>{formatPaise(paise(data.requiredBalancePaise))}</dd>
          </div>

          <Row
            label={t('walletBalance')}
            value={formatPaise(paise(data.walletBalancePaise))}
            muted
          />
        </dl>

        <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
          {t('planFeeNote')}
        </p>
      </section>

      <section className="bg-card px-4 py-4">
      {/* B2 — "a clear 'prices vary daily with market rates' line". */}
      <p className="rounded-[var(--radius)] bg-secondary px-4 py-3 text-[11px] leading-relaxed text-muted-foreground">
        {t('priceWarning')}
      </p>

      {shortfall > 0n && (
        <div className="mt-4 rounded-[var(--radius)] border border-warning/40 bg-[#FDF3E3] px-4 py-3">
          <p className="text-sm font-semibold text-[#8A5A2B]">
            {t('shortfall', { amount: formatPaise(shortfall) })}
          </p>
          <button
            type="button"
            onClick={() => setTopupOpen(true)}
            disabled={!wallet.data}
            className="mt-3 h-11 w-full rounded-[var(--radius)] bg-primary text-sm font-bold text-primary-foreground disabled:opacity-50"
          >
            {t('topUpAndReturn')}
          </button>
        </div>
      )}

      {error && (
        <p className="mt-4 rounded-[var(--radius)] bg-danger/10 px-3 py-2.5 text-sm text-danger">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={() => {
          setError(null);
          approve.mutate();
        }}
        disabled={!canSubmit}
        className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-[var(--radius)] bg-primary text-sm font-bold text-primary-foreground disabled:opacity-50"
      >
        {approve.isPending && <Loader2 className="size-4 animate-spin" aria-hidden />}
        {approve.isPending ? t('confirming') : t('confirm')}
      </button>
      </section>

      {topupOpen && wallet.data && (
        <TopupSheet
          presetsPaise={wallet.data.topupPresetsPaise}
          minimumPaise={wallet.data.minimumTopupPaise}
          onClose={() => {
            setTopupOpen(false);
            // B3 — come straight back with the new balance reflected.
            void quote.refetch();
          }}
        />
      )}
      </main>
    </>
  );
}

function Row({
  label,
  value,
  muted,
  highlight,
}: {
  label: string;
  value: string;
  muted?: boolean;
  highlight?: boolean;
}) {
  return (
    <div className="flex justify-between">
      <dt className="text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          'font-medium',
          muted && 'text-muted-foreground',
          highlight && 'font-semibold text-success',
        )}
      >
        {value}
      </dd>
    </div>
  );
}
