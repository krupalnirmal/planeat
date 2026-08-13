'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, Stethoscope } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Link } from '@/i18n/navigation';
import { AdminPageHeader } from '@/components/admin/admin-shell';
import { api } from '@/lib/api/client';
import { formatPaise, paise } from '@/lib/money';
import { cn } from '@/lib/utils';

/**
 * M9 dashboard.
 *
 * Two things at the top are ALARMS, not statistics, and they are styled to be
 * impossible to scroll past:
 *
 *   B8 — unreviewed flagged plans. Each one is a customer whose profile said
 *   something a doctor should see.
 *
 *   M6 — cron health. "A silent cron failure means nobody gets vegetables",
 *   and the owner otherwise finds out from phone calls at 07:00.
 *
 * Everything below them is context.
 */

interface Metrics {
  dateKey: string;
  todayOrders: number;
  todayRevenuePaise: string;
  todayDelivered: number;
  todayPaymentPending: number;
  activeSubscriptions: number;
  pausedSubscriptions: number;
  expiringWithin2Days: number;
  unreviewedFlaggedPlans: number;
  pendingSwapRequests: number;
  openOrderIssues: number;
  lowStockCount: number;
  outOfStockCount: number;
  waitlistTotal: number;
  waitlistTopPincodes: Array<{ pincode: string; count: number }>;
  cron: {
    targetDate: string;
    activeSubscriptions: number;
    ordersGenerated: number;
    paymentPending: number;
    alert: boolean;
  };
}

export function AdminDashboard() {
  const t = useTranslations('admin.dashboard');
  const tc = useTranslations('admin.common');
  const queryClient = useQueryClient();
  const [notice, setNotice] = useState<string | null>(null);

  const metrics = useQuery({
    queryKey: ['admin-dashboard'],
    queryFn: () => api.get<Metrics>('/api/admin/dashboard'),
    // The owner leaves this open on a laptop all morning; a stale cron alert
    // is exactly the thing that must not sit there unnoticed.
    refetchInterval: 60_000,
  });

  const regenerate = useMutation({
    mutationFn: () => api.post<{ created: number; duplicates: number }>('/api/admin/cron-health'),
    onSuccess: (data) => {
      setNotice(t('regenerated', { created: data.created, duplicates: data.duplicates }));
      void queryClient.invalidateQueries({ queryKey: ['admin-dashboard'] });
    },
    onError: () => setNotice(tc('failed')),
  });

  if (metrics.isLoading) {
    return <p className="text-sm text-muted-foreground">{tc('loading')}</p>;
  }

  const data = metrics.data;
  if (!data) return <p className="text-sm text-danger">{tc('failed')}</p>;

  return (
    <>
      <AdminPageHeader title={t('title')} subtitle={data.dateKey} />

      {notice && (
        <p className="mb-4 rounded-[var(--radius)] bg-primary/5 px-4 py-3 text-sm">{notice}</p>
      )}

      {/* ── M6: the alarm that matters most operationally. */}
      <section
        className={cn(
          'mb-4 flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius)] border px-4 py-3',
          data.cron.alert
            ? 'border-danger/50 bg-danger/10'
            : 'border-success/30 bg-primary/5',
        )}
      >
        <div className="flex items-start gap-3">
          {data.cron.alert ? (
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-danger" aria-hidden />
          ) : (
            <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" aria-hidden />
          )}
          <div>
            <p className="text-sm font-semibold">{t('cronTitle')}</p>
            <p className={cn('mt-0.5 text-xs', data.cron.alert ? 'text-danger' : 'text-muted-foreground')}>
              {data.cron.alert
                ? `${t('cronAlert')} ${t('cronAlertHint', { count: data.cron.activeSubscriptions })}`
                : t('cronOk', { count: data.cron.ordersGenerated })}
            </p>
          </div>
        </div>

        {/* M6 — "plus a manual 'regenerate today' button". */}
        <button
          type="button"
          onClick={() => regenerate.mutate()}
          disabled={regenerate.isPending}
          className="flex h-10 shrink-0 items-center gap-2 rounded-[var(--radius)] border border-border bg-card px-3 text-xs font-semibold disabled:opacity-50"
        >
          {regenerate.isPending ? (
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
          ) : (
            <RefreshCw className="size-3.5" aria-hidden />
          )}
          {regenerate.isPending ? t('regenerating') : t('regenerate')}
        </button>
      </section>

      {/* ── B8: "shows the unreviewed count prominently". */}
      {data.unreviewedFlaggedPlans > 0 && (
        <Link
          href="/admin/meal-plans?unreviewedOnly=true"
          className="mb-4 flex items-center gap-3 rounded-[var(--radius)] border border-warning/50 bg-[#FDF3E3] px-4 py-3"
        >
          <Stethoscope className="size-5 shrink-0 text-warning" aria-hidden />
          <div>
            <p className="text-sm font-bold text-[#8A5A2B]">
              {data.unreviewedFlaggedPlans} · {t('flaggedPlans')}
            </p>
            <p className="mt-0.5 text-xs text-[#8A5A2B]/85">{t('flaggedHint')}</p>
          </div>
        </Link>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label={t('todayOrders')} value={String(data.todayOrders)} />
        <Stat
          label={t('todayRevenue')}
          value={formatPaise(paise(data.todayRevenuePaise), { hidePaise: true })}
        />
        <Stat label={t('delivered')} value={String(data.todayDelivered)} />
        <Stat
          label={t('paymentPending')}
          value={String(data.todayPaymentPending)}
          tone={data.todayPaymentPending > 0 ? 'warning' : undefined}
        />

        <Stat label={t('activeSubscriptions')} value={String(data.activeSubscriptions)} />
        <Stat label={t('pausedSubscriptions')} value={String(data.pausedSubscriptions)} />
        <Stat label={t('expiringSoon')} value={String(data.expiringWithin2Days)} />
        <Stat label={t('pendingSwaps')} value={String(data.pendingSwapRequests)} />

        <Stat
          label={t('lowStock')}
          value={String(data.lowStockCount)}
          tone={data.lowStockCount > 0 ? 'warning' : undefined}
          href="/admin/inventory?onlyLow=true"
        />
        <Stat
          label={t('outOfStock')}
          value={String(data.outOfStockCount)}
          tone={data.outOfStockCount > 0 ? 'danger' : undefined}
          href="/admin/inventory?onlyOut=true"
        />
        <Stat
          label={t('openIssues')}
          value={String(data.openOrderIssues)}
          tone={data.openOrderIssues > 0 ? 'warning' : undefined}
        />
        <Stat label={t('waitlist')} value={String(data.waitlistTotal)} href="/admin/waitlist" />
      </div>

      {/* B11 — where the demand is. */}
      {data.waitlistTopPincodes.length > 0 && (
        <section className="mt-5 rounded-[var(--radius)] border border-border bg-card p-4">
          <h2 className="mb-3 text-sm font-semibold">{t('waitlist')}</h2>
          <ul className="flex flex-wrap gap-2">
            {data.waitlistTopPincodes.map((entry) => (
              <li
                key={entry.pincode}
                className="rounded-full bg-secondary px-3 py-1.5 text-xs font-medium"
              >
                {entry.pincode} · {entry.count}
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

function Stat({
  label,
  value,
  tone,
  href,
}: {
  label: string;
  value: string;
  tone?: 'warning' | 'danger';
  href?: string;
}) {
  const body = (
    <div
      className={cn(
        'rounded-[var(--radius)] border bg-card px-4 py-3',
        tone === 'danger'
          ? 'border-danger/40'
          : tone === 'warning'
            ? 'border-warning/40'
            : 'border-border',
      )}
    >
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={cn(
          'mt-1 text-2xl font-bold tabular-nums',
          tone === 'danger' ? 'text-danger' : tone === 'warning' ? 'text-warning' : '',
        )}
      >
        {value}
      </p>
    </div>
  );

  return href ? <Link href={href}>{body}</Link> : body;
}
