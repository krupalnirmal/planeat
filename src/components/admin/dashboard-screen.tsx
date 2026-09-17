'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { Link } from '@/i18n/navigation';
import { AdminPageHeader } from '@/components/admin/admin-shell';
import {
  HorizontalBarChart,
  ORDER_STATUS_COLORS,
  OrdersTrendChart,
  PAYMENT_METHOD_COLORS,
  RevenueTrendChart,
} from '@/components/admin/charts';
import { api, qs } from '@/lib/api/client';
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

  analytics: {
    dailySeries: Array<{ dateKey: string; orders: number; revenuePaise: string }>;
    orderStatusToday: Array<{ status: string; count: number }>;
    topCategories: Array<{ slug: string; name: string; revenuePaise: string }>;
    paymentMethodSplit: Array<{ method: string; count: number; revenuePaise: string }>;
  };
}

export function AdminDashboard() {
  const t = useTranslations('admin.dashboard');
  const tc = useTranslations('admin.common');
  // Reused rather than duplicated — the same short labels the customer-
  // facing order tracker already has for every OrderStatus/PaymentMethod.
  const tStatus = useTranslations('orders.status');
  const tPayment = useTranslations('orders.payment');
  const locale = useLocale();
  const queryClient = useQueryClient();
  const [notice, setNotice] = useState<string | null>(null);

  const metrics = useQuery({
    queryKey: ['admin-dashboard', locale],
    queryFn: () => api.get<Metrics>(`/api/admin/dashboard${qs({ locale })}`),
    // The owner leaves this open on a laptop all morning; a stale cron alert
    // is exactly the thing that must not sit there unnoticed.
    refetchInterval: 60_000,
    // Interaction spec: refetch keeps the previous render, not a skeleton
    // flash — the charts below hold their last data at reduced opacity
    // while `isFetching` (but not the initial `isLoading`) is true.
    placeholderData: (previous) => previous,
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
    // Interaction spec: a background refetch (the 60s poll) holds the
    // previous render at reduced opacity instead of a skeleton flash or
    // layout jump — `isFetching` is also true on the very first load, so
    // this only kicks in once `data` already exists (the `isLoading` guard
    // above returns before this point on that first load).
    <div className={cn('transition-opacity', metrics.isFetching && 'opacity-60')}>
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

      {/* ── Analytics — real queries, same as every stat tile above, just
          charted instead of a single number. A "revenue vs orders" pair
          stays two single-hue charts rather than one dual-axis plot (the
          #1 anti-pattern the skill calls out: two different scales sharing
          one axis invents a correlation that isn't there). */}
      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <ChartCard title={t('revenueTrend')} subtitle={t('last14Days')}>
          <RevenueTrendChart data={data.analytics.dailySeries} />
        </ChartCard>
        <ChartCard title={t('ordersTrend')} subtitle={t('last14Days')}>
          <OrdersTrendChart data={data.analytics.dailySeries} />
        </ChartCard>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <ChartCard title={t('orderPipeline')} subtitle={data.dateKey}>
          {data.analytics.orderStatusToday.length > 0 ? (
            <HorizontalBarChart
              items={data.analytics.orderStatusToday.map((s) => ({
                key: s.status,
                label: tStatus(s.status),
                value: s.count,
                color: ORDER_STATUS_COLORS[s.status] ?? '#8a8a8a',
              }))}
              valueFormat={(v) => String(v)}
            />
          ) : (
            <EmptyChart label={t('noOrdersToday')} />
          )}
        </ChartCard>

        <ChartCard title={t('topCategories')} subtitle={t('last7Days')}>
          {data.analytics.topCategories.length > 0 ? (
            <HorizontalBarChart
              items={data.analytics.topCategories.map((c) => ({
                key: c.slug,
                label: c.name,
                value: Number(paise(c.revenuePaise)) / 100,
                color: '#2fa355',
              }))}
              valueFormat={(v) => formatPaise(paise(BigInt(Math.round(v * 100))), { hidePaise: true })}
            />
          ) : (
            <EmptyChart label={t('noRecentSales')} />
          )}
        </ChartCard>

        <ChartCard title={t('paymentMethods')} subtitle={t('last7Days')}>
          {data.analytics.paymentMethodSplit.length > 0 ? (
            <HorizontalBarChart
              items={data.analytics.paymentMethodSplit.map((p) => ({
                key: p.method,
                label: tPayment(p.method),
                value: p.count,
                color: PAYMENT_METHOD_COLORS[p.method] ?? '#8a8a8a',
              }))}
              valueFormat={(v) => String(v)}
            />
          ) : (
            <EmptyChart label={t('noRecentSales')} />
          )}
        </ChartCard>
      </div>
    </div>
  );
}

function ChartCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[var(--radius)] border border-border bg-card p-4">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">{title}</h2>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}

function EmptyChart({ label }: { label: string }) {
  return (
    <p className="grid h-[120px] place-items-center text-center text-xs text-muted-foreground">
      {label}
    </p>
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
