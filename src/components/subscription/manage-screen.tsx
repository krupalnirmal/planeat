'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  MapPin,
  Package,
  PauseCircle,
  PlayCircle,
  Wallet,
  XCircle,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Link } from '@/i18n/navigation';
import { CenteredState, PageHeader } from '@/components/shop/page-header';
import { MyWeek, type WeekDay } from '@/components/subscription/my-week';
import { TopupSheet } from '@/components/wallet/topup-sheet';
import { useSession } from '@/hooks/use-session';
import { ApiClientError, api } from '@/lib/api/client';
import { formatPaise, paise } from '@/lib/money';
import { cn } from '@/lib/utils';

/** M6 — pause a range, resume, cancel, and change address for future days.
    Extended (session 2026-09-15, client reference) into the "During Plan"
    dashboard: a progress bar, a wallet quick-view with a low-balance
    reminder, and the day-by-day schedule (`MyWeek`, previously built but
    never mounted anywhere) instead of just the bare "N days left" this
    screen used to show. */

interface WalletResponse {
  balancePaise: string;
  isLowBalance: boolean;
  lowBalanceThresholdPaise: string;
  topupPresetsPaise: string[];
  minimumTopupPaise: string;
}

/** IST calendar date "now" — same UTC+5:30 shift the server-side
    `istDateKeyOf` uses, reimplemented since this runs client-side. */
function todayIstDateKey(): string {
  return new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 10);
}

/** Whole calendar days between two dates — accepts either a `YYYY-MM-DD` key
    or a full ISO timestamp (the subscription API returns the latter). */
function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);
}

interface SubscriptionResponse {
  subscription: {
    id: string;
    status: 'ACTIVE' | 'PAUSED' | 'CANCELLED' | 'COMPLETED';
    startDate: string;
    endDate: string;
    daysUntilEnd: number;
    address: { id: string; label: string; line1: string; city: string; pincode: string };
  } | null;
  /** M6's "My Week" — already bundled into this same response
      (`src/app/api/subscriptions/current/route.ts`: "two round trips to
      Singapore for one screen is one too many"), so `MyWeek` below reads
      straight off it instead of its own fetch. */
  week: { subscriptionId: string; days: WeekDay[] } | null;
}

export function SubscriptionManageScreen() {
  const t = useTranslations('subscription');
  const tc = useTranslations('common');
  const te = useTranslations('errors');
  const queryClient = useQueryClient();
  const { user } = useSession();

  const [pauseFrom, setPauseFrom] = useState('');
  const [pauseTo, setPauseTo] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [topupOpen, setTopupOpen] = useState(false);

  const current = useQuery({
    queryKey: ['subscription-current'],
    queryFn: () => api.get<SubscriptionResponse>('/api/subscriptions/current'),
  });

  const subscription = current.data?.subscription ?? null;

  const wallet = useQuery({
    queryKey: ['wallet'],
    queryFn: () => api.get<WalletResponse>('/api/wallet'),
  });

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ['subscription-current'] });
  }

  function handleError(err: unknown) {
    setError(err instanceof ApiClientError ? err.message : te('generic'));
  }

  const pause = useMutation({
    mutationFn: () =>
      api.post(`/api/subscriptions/${subscription?.id}/pause`, {
        fromDate: pauseFrom,
        toDate: pauseTo,
      }),
    onSuccess: () => {
      setError(null);
      setNotice(t('paused'));
      refresh();
    },
    onError: handleError,
  });

  const resume = useMutation({
    mutationFn: () => api.post(`/api/subscriptions/${subscription?.id}/resume`),
    onSuccess: () => {
      setError(null);
      setNotice(null);
      refresh();
    },
    onError: handleError,
  });

  const cancel = useMutation({
    mutationFn: () =>
      api.post<{ refundedPaise: string }>(`/api/subscriptions/${subscription?.id}/cancel`),
    onSuccess: (data) => {
      const refunded = paise(data.refundedPaise);
      setError(null);
      setNotice(
        refunded > 0n
          ? `${t('cancelled')} · ${t('refunded', { amount: formatPaise(refunded) })}`
          : t('cancelled'),
      );
      refresh();
      void queryClient.invalidateQueries({ queryKey: ['wallet'] });
    },
    onError: handleError,
  });

  const changeAddress = useMutation({
    mutationFn: (addressId: string) =>
      api.patch(`/api/subscriptions/${subscription?.id}`, { addressId }),
    onSuccess: () => {
      setError(null);
      refresh();
    },
    onError: handleError,
  });

  if (current.isLoading) {
    return (
      <>
        <PageHeader title={t('manage')} backHref="/meal-plan" backLabel={tc('back')} />
        <main className="pb-2">
          <div className="bg-card px-4 py-8 text-sm text-muted-foreground">{tc('loading')}</div>
        </main>
      </>
    );
  }

  if (!subscription) {
    return (
      <>
        <PageHeader title={t('manage')} backHref="/meal-plan" backLabel={tc('back')} />
        <main className="pb-2">
          <div className="bg-card">
            <CenteredState>
              <p className="text-sm text-muted-foreground">{t('noSubscription')}</p>
              <Link
                href="/meal-plan/subscribe"
                className="mt-4 inline-block text-sm font-semibold text-primary"
              >
                {t('startPlan')}
              </Link>
            </CenteredState>
          </div>
        </main>
      </>
    );
  }

  const isPaused = subscription.status === 'PAUSED';
  const isOver = subscription.status === 'CANCELLED' || subscription.status === 'COMPLETED';

  return (
    <>
      <header className="sticky top-0 z-30 flex items-center gap-2 border-b border-border bg-accent-faint px-3 py-3">
        <Link
          href="/meal-plan"
          aria-label={tc('back')}
          className="grid size-11 shrink-0 place-items-center rounded-full"
        >
          <ChevronLeft className="size-5" aria-hidden />
        </Link>
        <div className="min-w-0">
          <h1 className="text-base font-bold">{t('manage')}</h1>
          <p className="text-xs text-muted-foreground">
            {t('activeUntil', { date: subscription.endDate })} ·{' '}
            {t('daysLeft', { count: subscription.daysUntilEnd })}
          </p>
        </div>
      </header>

      <main className="space-y-2 pb-2">
      {/* ── Screen 9: "During Plan" — progress, wallet, quick links.
          Replaces the bare "N days left" the header used to be the only
          place showing. */}
      {subscription.status === 'ACTIVE' && (
        <DuringPlanDashboard
          subscription={subscription}
          wallet={wallet.data}
          onAddMoney={() => setTopupOpen(true)}
        />
      )}

      {subscription.status === 'ACTIVE' && current.data?.week && current.data.week.days.length > 0 && (
        <section className="bg-card px-4 py-4">
          <MyWeek subscriptionId={subscription.id} days={current.data.week.days} todayKey={todayIstDateKey()} />
        </section>
      )}

      {(notice || error) && (
        <div className="bg-card px-4 py-4">
          {notice && (
            <p className="rounded-[var(--radius)] bg-primary/5 px-3 py-2.5 text-sm text-success">
              {notice}
            </p>
          )}
          {error && (
            <p className="mt-2 rounded-[var(--radius)] bg-danger/10 px-3 py-2.5 text-sm text-danger">
              {error}
            </p>
          )}
        </div>
      )}

      {/* ── Address for future deliveries */}
      <section className="bg-card px-4 py-4">
        <h2 className="text-sm font-semibold">{t('changeAddress')}</h2>
        <p className="mt-0.5 text-[11px] text-muted-foreground">{t('addressNote')}</p>

        <ul className="mt-3 space-y-2">
          {user?.addresses.map((address) => (
            <li key={address.id}>
              <button
                type="button"
                onClick={() => changeAddress.mutate(address.id)}
                disabled={isOver || changeAddress.isPending}
                aria-pressed={subscription.address.id === address.id}
                className={cn(
                  'flex w-full gap-2 rounded-[var(--radius)] border p-3 text-left disabled:opacity-60',
                  subscription.address.id === address.id
                    ? 'border-primary bg-primary/5'
                    : 'border-border bg-background',
                )}
              >
                <MapPin className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{address.label}</span>
                  <span className="block text-xs text-muted-foreground">
                    {address.line1}, {address.city} — {address.pincode}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      {/* ── Pause / resume */}
      <section className="bg-card px-4 py-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <CalendarRange className="size-4 text-primary" aria-hidden />
          {t('pauseTitle')}
        </h2>

        {isPaused ? (
          <button
            type="button"
            onClick={() => resume.mutate()}
            disabled={resume.isPending}
            className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-[var(--radius)] bg-primary text-sm font-bold text-primary-foreground disabled:opacity-50"
          >
            <PlayCircle className="size-4" aria-hidden />
            {t('resume')}
          </button>
        ) : (
          <>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="pause-from" className="text-xs font-medium">
                  {t('pauseFrom')}
                </label>
                <input
                  id="pause-from"
                  type="date"
                  value={pauseFrom}
                  min={subscription.startDate}
                  max={subscription.endDate}
                  onChange={(event) => setPauseFrom(event.target.value)}
                  className="input-3d mt-1 h-12 w-full rounded-[var(--radius)] border border-border/60 bg-background px-2 text-sm outline-none focus:border-primary"
                />
              </div>
              <div>
                <label htmlFor="pause-to" className="text-xs font-medium">
                  {t('pauseTo')}
                </label>
                <input
                  id="pause-to"
                  type="date"
                  value={pauseTo}
                  min={pauseFrom || subscription.startDate}
                  max={subscription.endDate}
                  onChange={(event) => setPauseTo(event.target.value)}
                  className="input-3d mt-1 h-12 w-full rounded-[var(--radius)] border border-border/60 bg-background px-2 text-sm outline-none focus:border-primary"
                />
              </div>
            </div>

            <button
              type="button"
              onClick={() => pause.mutate()}
              disabled={!pauseFrom || !pauseTo || isOver || pause.isPending}
              className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-[var(--radius)] border border-border text-sm font-semibold disabled:opacity-50"
            >
              <PauseCircle className="size-4" aria-hidden />
              {t('pause')}
            </button>
          </>
        )}
      </section>

      {/* ── Cancel. B3: unused money always goes back. */}
      {!isOver && (
        <section className="border-t-2 border-danger/30 bg-card px-4 py-4">
          <h2 className="text-sm font-semibold text-danger">{t('cancelTitle')}</h2>
          <button
            type="button"
            onClick={() => {
              if (confirm(t('cancelConfirm'))) cancel.mutate();
            }}
            disabled={cancel.isPending}
            className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-[var(--radius)] border border-danger text-sm font-semibold text-danger disabled:opacity-50"
          >
            <XCircle className="size-4" aria-hidden />
            {t('cancel')}
          </button>
        </section>
      )}
      </main>

      {topupOpen && wallet.data && (
        <TopupSheet
          presetsPaise={wallet.data.topupPresetsPaise}
          minimumPaise={wallet.data.minimumTopupPaise}
          onClose={() => setTopupOpen(false)}
        />
      )}
    </>
  );
}

function DuringPlanDashboard({
  subscription,
  wallet,
  onAddMoney,
}: {
  subscription: NonNullable<SubscriptionResponse['subscription']>;
  wallet: WalletResponse | undefined;
  onAddMoney: () => void;
}) {
  const t = useTranslations('subscription');

  const totalDays = daysBetween(subscription.startDate, subscription.endDate) + 1;
  const daysCompleted = Math.max(0, totalDays - subscription.daysUntilEnd);
  const progressPercent = totalDays > 0 ? Math.min(100, Math.round((daysCompleted / totalDays) * 100)) : 0;

  return (
    <section className="space-y-3 bg-card px-4 py-4">
      <div>
        <div className="flex items-center justify-between text-sm">
          <span className="font-bold">{daysCompleted}</span>
          <span className="font-bold">{subscription.daysUntilEnd}</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-secondary">
          <div className="h-full rounded-full bg-primary" style={{ width: `${progressPercent}%` }} />
        </div>
        <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground">
          <span>{t('daysCompleted')}</span>
          <span>{t('daysRemaining')}</span>
        </div>
      </div>

      {wallet && (
        <div className="flex items-center justify-between rounded-[var(--radius)] bg-tint-green px-3 py-2.5">
          <span className="flex items-center gap-1.5 text-xs font-semibold text-primary-dark">
            <Wallet className="size-3.5" aria-hidden />
            {t('walletBalance')}
          </span>
          <span className="text-sm font-bold">{formatPaise(paise(wallet.balancePaise))}</span>
        </div>
      )}

      {wallet?.isLowBalance && (
        <LowBalanceReminder wallet={wallet} onAddMoney={onAddMoney} />
      )}

      <ul className="divide-y divide-border overflow-hidden rounded-[var(--radius)] border border-border">
        <QuickLink href="/meal-plan/build/summary" icon={ClipboardList} label={t('viewPlanDetails')} />
        <QuickLink href="/orders" icon={Package} label={t('ordersAndDeliveries')} />
        <li>
          <button
            type="button"
            onClick={onAddMoney}
            className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left"
          >
            <span className="flex items-center gap-2.5 text-sm font-medium">
              <Wallet className="size-4 text-muted-foreground" aria-hidden />
              {t('addMoneyToWallet')}
            </span>
            <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
          </button>
        </li>
      </ul>
    </section>
  );
}

function QuickLink({ href, icon: Icon, label }: { href: string; icon: typeof ClipboardList; label: string }) {
  return (
    <li>
      <Link href={href} className="flex items-center justify-between gap-3 px-3 py-3">
        <span className="flex items-center gap-2.5 text-sm font-medium">
          <Icon className="size-4 text-muted-foreground" aria-hidden />
          {label}
        </span>
        <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
      </Link>
    </li>
  );
}

/** Screen 10 — a recommended top-up sized to clear the low-balance
    threshold, rounded up to whichever configured preset covers it (falling
    back to the largest preset if none do). */
function LowBalanceReminder({ wallet, onAddMoney }: { wallet: WalletResponse; onAddMoney: () => void }) {
  const t = useTranslations('subscription');

  const gap = paise(wallet.lowBalanceThresholdPaise) - paise(wallet.balancePaise);
  const presets = wallet.topupPresetsPaise
    .map((p) => paise(p))
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const recommended = presets.find((p) => p >= gap) ?? presets[presets.length - 1] ?? gap;

  return (
    <div className="rounded-[var(--radius)] border border-warning/40 bg-[#FDF3E3] p-3">
      <p className="flex items-center gap-1.5 text-sm font-bold text-warning">
        <AlertTriangle className="size-4 shrink-0" aria-hidden />
        {t('lowBalanceTitle')}
      </p>
      <p className="mt-1 text-xs text-warning/90">
        {t('lowBalanceSubtitle', { amount: formatPaise(paise(wallet.balancePaise)) })}
      </p>
      <button
        type="button"
        onClick={onAddMoney}
        className="mt-2.5 flex h-10 w-full items-center justify-center gap-1.5 rounded-[var(--radius)] bg-primary text-xs font-bold text-primary-foreground"
      >
        {t('recommendedAdd', { amount: formatPaise(recommended, { hidePaise: true }) })}
      </button>
    </div>
  );
}
