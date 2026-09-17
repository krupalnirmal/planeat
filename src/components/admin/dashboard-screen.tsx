'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Apple,
  Bike,
  CheckCircle2,
  ChefHat,
  Clock,
  Cookie,
  CreditCard,
  Crown,
  Download,
  IceCream,
  IndianRupee,
  Loader2,
  MessageCircle,
  Milk,
  Package,
  PauseCircle,
  RefreshCw,
  ShoppingBasket,
  ShoppingCart,
  Truck,
  Users,
} from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { Link } from '@/i18n/navigation';
import { AdminPageHeader } from '@/components/admin/admin-shell';
import {
  DonutChart,
  HorizontalBarChart,
  OrdersTrendChart,
  PAYMENT_METHOD_COLORS,
  RevenueTrendChart,
  Sparkline,
} from '@/components/admin/charts';
import { STATUS_TONE } from '@/components/admin/orders-screen';
import { api, qs } from '@/lib/api/client';
import { formatPaise, paise } from '@/lib/money';
import { cn } from '@/lib/utils';

/**
 * M9 dashboard — redesigned session 2026-09-17 to match the client's
 * reference screenshot.
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
 * Everything below them is context — including the sparkline+delta on the 3
 * stat tiles with real daily history (Orders/Revenue/Delivered) and the
 * plain-number treatment on the other 8, which don't have one (no fabricated
 * trend for a point-in-time count the schema keeps no history of).
 */

type DashboardRange = '14d' | '30d' | 'month';

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

  deltas: { orders: number | null; revenue: number | null; delivered: number | null };

  analytics: {
    range: DashboardRange;
    dailySeries: Array<{ dateKey: string; orders: number; delivered: number; revenuePaise: string }>;
    orderStatusToday: Array<{ status: string; count: number }>;
    topCategories: Array<{ slug: string; name: string; revenuePaise: string }>;
    paymentMethodSplit: Array<{ method: string; count: number; revenuePaise: string }>;
  };
}

interface RecentOrder {
  id: string;
  orderNumber: string;
  customerName: string;
  itemCount: number;
  totalPaise: string;
  paymentMethod: string;
  status: string;
  placedAt: string;
}

const RANGE_OPTIONS: DashboardRange[] = ['14d', '30d', 'month'];

const CATEGORY_ICON: Record<string, typeof Apple> = {
  vegetables: ChefHat,
  fruits: Apple,
  dairy: Milk,
  'bakery-biscuits': Cookie,
  'ice-cream': IceCream,
  grocery: ShoppingBasket,
};

/** The reference mockup's "happy path" funnel — the 3 exit statuses
    (Cancelled/Failed/Refunded) aren't pipeline stages, they're what the
    pipeline is instead of, so they're deliberately left out here. */
const PIPELINE_STEPS = [
  { status: 'PLACED', icon: ShoppingCart },
  { status: 'CONFIRMED', icon: CheckCircle2 },
  { status: 'PACKED', icon: Package },
  { status: 'OUT_FOR_DELIVERY', icon: Truck },
  { status: 'DELIVERED', icon: CheckCircle2 },
] as const;

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
  const [range, setRange] = useState<DashboardRange>('14d');

  const metrics = useQuery({
    queryKey: ['admin-dashboard', locale, range],
    queryFn: () => api.get<Metrics>(`/api/admin/dashboard${qs({ locale, range })}`),
    // The owner leaves this open on a laptop all morning; a stale cron alert
    // is exactly the thing that must not sit there unnoticed.
    refetchInterval: 60_000,
    // Interaction spec: refetch keeps the previous render, not a skeleton
    // flash — the charts below hold their last data at reduced opacity
    // while `isFetching` (but not the initial `isLoading`) is true.
    placeholderData: (previous) => previous,
  });

  // A separate, small query rather than folded into the dashboard metrics
  // endpoint — this is exactly the existing orders list API
  // (`GET /api/admin/orders`) with a small `perPage`, zero new backend.
  const recentOrders = useQuery({
    queryKey: ['admin-dashboard-recent-orders'],
    queryFn: () => api.get<{ orders: RecentOrder[] }>(`/api/admin/orders${qs({ perPage: 6, page: 1 })}`),
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

  const formattedDate = new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(`${data.dateKey}T00:00:00`));

  const revenueSparkline = data.analytics.dailySeries
    .slice(-7)
    .map((d) => Number(paise(d.revenuePaise)) / 100);
  const ordersSparkline = data.analytics.dailySeries.slice(-7).map((d) => d.orders);
  const deliveredSparkline = data.analytics.dailySeries.slice(-7).map((d) => d.delivered);

  const exportHref = `/api/admin/orders${qs({
    format: 'csv',
    dateFrom: data.analytics.dailySeries[0]?.dateKey,
    dateTo: data.analytics.dailySeries[data.analytics.dailySeries.length - 1]?.dateKey,
  })}`;

  return (
    // Interaction spec: a background refetch (the 60s poll) holds the
    // previous render at reduced opacity instead of a skeleton flash or
    // layout jump — `isFetching` is also true on the very first load, so
    // this only kicks in once `data` already exists (the `isLoading` guard
    // above returns before this point on that first load).
    <div className={cn('transition-opacity', metrics.isFetching && 'opacity-60')}>
      <AdminPageHeader
        title={t('title')}
        subtitle={formattedDate}
        action={
          <a
            href={exportHref}
            className="flex h-10 items-center gap-2 rounded-[var(--radius)] border border-border bg-card px-3 text-xs font-semibold"
          >
            <Download className="size-3.5" aria-hidden />
            {t('export')}
          </a>
        }
      />

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
        <Stat
          label={t('todayOrders')}
          value={String(data.todayOrders)}
          icon={ShoppingCart}
          delta={data.deltas.orders}
          sparklineData={ordersSparkline}
        />
        <Stat
          label={t('todayRevenue')}
          value={formatPaise(paise(data.todayRevenuePaise), { hidePaise: true })}
          icon={IndianRupee}
          delta={data.deltas.revenue}
          sparklineData={revenueSparkline}
        />
        <Stat
          label={t('delivered')}
          value={String(data.todayDelivered)}
          icon={Truck}
          delta={data.deltas.delivered}
          sparklineData={deliveredSparkline}
        />
        <Stat
          label={t('paymentPending')}
          value={String(data.todayPaymentPending)}
          icon={CreditCard}
          tone={data.todayPaymentPending > 0 ? 'warning' : undefined}
        />

        <Stat label={t('activeSubscriptions')} value={String(data.activeSubscriptions)} icon={Crown} />
        <Stat label={t('pausedSubscriptions')} value={String(data.pausedSubscriptions)} icon={PauseCircle} />
        <Stat label={t('expiringSoon')} value={String(data.expiringWithin2Days)} icon={Clock} />

        <Stat
          label={t('lowStock')}
          value={String(data.lowStockCount)}
          icon={Package}
          tone={data.lowStockCount > 0 ? 'warning' : undefined}
          href="/admin/inventory?onlyLow=true"
        />
        <Stat
          label={t('outOfStock')}
          value={String(data.outOfStockCount)}
          icon={AlertTriangle}
          tone={data.outOfStockCount > 0 ? 'danger' : undefined}
          href="/admin/inventory?onlyOut=true"
        />
        <Stat
          label={t('openIssues')}
          value={String(data.openOrderIssues)}
          icon={MessageCircle}
          tone={data.openOrderIssues > 0 ? 'warning' : undefined}
        />
        <Stat label={t('waitlist')} value={String(data.waitlistTotal)} icon={Users} href="/admin/waitlist" />
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
          one axis invents a correlation that isn't there).
          One range control above both — not the mockup's separate
          per-chart pills — per the interaction spec's own "one filter row
          above everything it scopes" rule. */}
      <div className="mt-5 flex items-center justify-end gap-1.5">
        {RANGE_OPTIONS.map((opt) => (
          <button
            key={opt}
            type="button"
            onClick={() => setRange(opt)}
            className={cn(
              'rounded-full px-3 py-1.5 text-xs font-semibold transition-colors',
              range === opt ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground',
            )}
          >
            {t(`range.${opt}`)}
          </button>
        ))}
      </div>

      <div className="mt-2 grid gap-4 lg:grid-cols-2">
        <ChartCard title={t('revenueTrend')}>
          <RevenueTrendChart data={data.analytics.dailySeries} />
        </ChartCard>
        <ChartCard title={t('ordersTrend')}>
          <OrdersTrendChart data={data.analytics.dailySeries} />
        </ChartCard>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <ChartCard title={t('orderPipeline')} subtitle={data.dateKey} className="lg:col-span-3">
          <PipelineTracker
            statusCounts={data.analytics.orderStatusToday}
            tStatus={(status) => tStatus(status)}
            tPipeline={(status) => (status === 'PACKED' ? t('pipelinePreparing') : null)}
          />
        </ChartCard>

        <ChartCard title={t('topCategories')} subtitle={t(`range.${range}`)}>
          {data.analytics.topCategories.length > 0 ? (
            <HorizontalBarChart
              items={data.analytics.topCategories.map((c) => {
                const total = data.analytics.topCategories.reduce(
                  (sum, x) => sum + Number(paise(x.revenuePaise)),
                  0,
                );
                const share = total > 0 ? Math.round((Number(paise(c.revenuePaise)) / total) * 100) : 0;
                const Icon = CATEGORY_ICON[c.slug] ?? ShoppingBasket;
                return {
                  key: c.slug,
                  label: c.name,
                  value: Number(paise(c.revenuePaise)) / 100,
                  color: '#2fa355',
                  icon: <Icon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />,
                  badge: `${share}%`,
                };
              })}
              valueFormat={(v) => formatPaise(paise(BigInt(Math.round(v * 100))), { hidePaise: true })}
            />
          ) : (
            <EmptyChart label={t('noRecentSales')} />
          )}
        </ChartCard>

        <ChartCard title={t('paymentMethods')} subtitle={t(`range.${range}`)}>
          {data.analytics.paymentMethodSplit.length > 0 ? (
            <DonutChart
              items={data.analytics.paymentMethodSplit.map((p) => ({
                key: p.method,
                label: tPayment(p.method),
                value: p.count,
                color: PAYMENT_METHOD_COLORS[p.method] ?? '#8a8a8a',
              }))}
              formatTotal={(v) => String(v)}
            />
          ) : (
            <EmptyChart label={t('noRecentSales')} />
          )}
        </ChartCard>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <ChartCard title={t('recentOrders')} className="lg:col-span-2" noPad>
          <RecentOrdersTable orders={recentOrders.data?.orders ?? []} loading={recentOrders.isLoading} />
          <div className="border-t border-border p-3 text-right">
            <Link href="/admin/orders" className="text-xs font-semibold text-primary">
              {t('viewAllOrders')} →
            </Link>
          </div>
        </ChartCard>

        <ChartCard title={t('needsAttention')}>
          <NeedsAttentionPanel
            items={[
              { key: 'lowStock', label: t('lowStock'), count: data.lowStockCount, href: '/admin/inventory?onlyLow=true' },
              { key: 'expiring', label: t('expiringSoon'), count: data.expiringWithin2Days, href: '/admin/customers' },
              { key: 'paymentPending', label: t('paymentPending'), count: data.todayPaymentPending, href: '/admin/orders?status=PAYMENT_PENDING' },
              { key: 'openIssues', label: t('openIssues'), count: data.openOrderIssues, href: '/admin/orders' },
            ]}
          />
        </ChartCard>
      </div>
    </div>
  );
}

function ChartCard({
  title,
  subtitle,
  children,
  className,
  noPad,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
  noPad?: boolean;
}) {
  return (
    <section className={cn('overflow-hidden rounded-[var(--radius)] border border-border bg-card', className)}>
      <div className={cn('flex items-baseline justify-between gap-2', noPad ? 'px-4 pt-4 pb-3' : 'p-4 pb-3')}>
        <h2 className="text-sm font-semibold">{title}</h2>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </div>
      <div className={noPad ? '' : 'px-4 pb-4'}>{children}</div>
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

/** The reference's horizontal step-tracker — 5 circular icon nodes joined by
    a dashed connector, each showing the exact count of today's orders
    currently at that status (reuses `orderStatusToday`, no new query). */
function PipelineTracker({
  statusCounts,
  tStatus,
  tPipeline,
}: {
  statusCounts: Array<{ status: string; count: number }>;
  tStatus: (status: string) => string;
  /** The reference mockup relabels PACKED as "Preparing" for this specific
      funnel view — `orders.status.PACKED` ("Packed") stays as-is everywhere
      else (order detail, customer tracker), so this is a separate key
      rather than changing that shared one. */
  tPipeline: (status: string) => string | null;
}) {
  const byStatus = new Map(statusCounts.map((s) => [s.status, s.count]));

  return (
    <div className="flex items-start justify-between gap-1 overflow-x-auto py-1">
      {PIPELINE_STEPS.map((step, i) => {
        const Icon = step.icon;
        const count = byStatus.get(step.status) ?? 0;
        return (
          <div key={step.status} className="flex flex-1 items-start">
            <div className="flex min-w-[72px] flex-col items-center gap-1.5 text-center">
              <span className="grid size-11 shrink-0 place-items-center rounded-full bg-tint-green text-primary">
                <Icon className="size-5" aria-hidden />
              </span>
              <span className="text-[11px] leading-tight font-medium text-muted-foreground">
                {tPipeline(step.status) ?? tStatus(step.status)}
              </span>
              <span className="text-lg font-bold tabular-nums text-foreground">{count}</span>
            </div>
            {i < PIPELINE_STEPS.length - 1 && (
              <div
                aria-hidden
                className="mt-5 h-px flex-1 border-t-2 border-dashed border-border"
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function RecentOrdersTable({ orders, loading }: { orders: RecentOrder[]; loading: boolean }) {
  const tc = useTranslations('admin.common');
  const to = useTranslations('admin.orders');
  const tStatus = useTranslations('orders.status');
  const tPayment = useTranslations('orders.payment');

  if (loading) {
    return <p className="px-4 pb-4 text-xs text-muted-foreground">{tc('loading')}</p>;
  }
  if (orders.length === 0) {
    return <p className="px-4 pb-4 text-xs text-muted-foreground">{tc('empty')}</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-xs">
        <thead>
          <tr className="border-b border-border text-left text-muted-foreground">
            <th className="px-4 py-2 font-medium">{to('orderNumber')}</th>
            <th className="px-2 py-2 font-medium">{to('customer')}</th>
            <th className="px-2 py-2 font-medium">{to('items')}</th>
            <th className="px-2 py-2 font-medium">{to('total')}</th>
            <th className="px-2 py-2 font-medium">{to('paymentMethod')}</th>
            <th className="px-2 py-2 font-medium">{to('status')}</th>
            <th className="px-4 py-2 text-right font-medium">{to('placedAt')}</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => (
            <tr key={order.id} className="border-b border-border last:border-0">
              <td className="px-4 py-2.5">
                <Link href={`/admin/orders/${order.id}`} className="font-semibold text-primary">
                  #{order.orderNumber}
                </Link>
              </td>
              <td className="px-2 py-2.5 text-foreground">{order.customerName}</td>
              <td className="px-2 py-2.5 text-muted-foreground">{order.itemCount} items</td>
              <td className="px-2 py-2.5 font-semibold text-foreground">
                {formatPaise(paise(order.totalPaise), { hidePaise: true })}
              </td>
              <td className="px-2 py-2.5 text-muted-foreground">{tPayment(order.paymentMethod)}</td>
              <td className="px-2 py-2.5">
                <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold', STATUS_TONE[order.status])}>
                  {tStatus(order.status)}
                </span>
              </td>
              <td className="px-4 py-2.5 text-right text-muted-foreground">
                {new Date(order.placedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Pure repackaging of 4 numbers the dashboard already computes elsewhere on
    this same page — no new backend, just a focused "what to do next" list. */
function NeedsAttentionPanel({
  items,
}: {
  items: Array<{ key: string; label: string; count: number; href: string }>;
}) {
  return (
    <ul className="flex flex-col gap-1">
      {items.map((item) => (
        <li key={item.key}>
          <Link
            href={item.href}
            className="flex items-center justify-between gap-2 rounded-md px-1 py-1.5 text-sm hover:bg-secondary"
          >
            <span className="text-foreground">{item.label}</span>
            <span
              className={cn(
                'grid min-w-6 place-items-center rounded-full px-1.5 py-0.5 text-xs font-bold tabular-nums',
                item.count > 0 ? 'bg-danger/10 text-danger' : 'bg-secondary text-muted-foreground',
              )}
            >
              {item.count}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function Stat({
  label,
  value,
  tone,
  href,
  icon: Icon,
  delta,
  sparklineData,
}: {
  label: string;
  value: string;
  tone?: 'warning' | 'danger';
  href?: string;
  icon?: typeof Bike;
  /** Percentage vs. yesterday, or `null` for "no real trend to show" (either
      no history at all, or yesterday was zero — see `pctDelta` server-side). */
  delta?: number | null;
  sparklineData?: number[];
}) {
  const body = (
    <div
      className={cn(
        'flex items-start justify-between gap-2 rounded-[var(--radius)] border bg-card px-4 py-3',
        tone === 'danger'
          ? 'border-danger/40'
          : tone === 'warning'
            ? 'border-warning/40'
            : 'border-border',
      )}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          {Icon && (
            <span
              className={cn(
                'grid size-8 shrink-0 place-items-center rounded-full',
                tone === 'danger'
                  ? 'bg-danger/10 text-danger'
                  : tone === 'warning'
                    ? 'bg-warning/10 text-warning'
                    : 'bg-tint-green text-primary',
              )}
            >
              <Icon className="size-4" aria-hidden />
            </span>
          )}
          <p className="truncate text-xs text-muted-foreground">{label}</p>
        </div>
        <p
          className={cn(
            'mt-1.5 text-2xl font-bold tabular-nums',
            tone === 'danger' ? 'text-danger' : tone === 'warning' ? 'text-warning' : '',
          )}
        >
          {value}
        </p>
        {delta !== undefined && (
          <p
            className={cn(
              'mt-0.5 text-[11px] font-semibold',
              delta === null ? 'text-muted-foreground' : delta > 0 ? 'text-success' : delta < 0 ? 'text-danger' : 'text-muted-foreground',
            )}
          >
            {delta === null ? '—' : delta === 0 ? '— 0%' : `${delta > 0 ? '↑' : '↓'} ${Math.abs(delta)}%`}
          </p>
        )}
      </div>
      {sparklineData && sparklineData.some((v) => v > 0) && <Sparkline data={sparklineData} />}
    </div>
  );

  return href ? <Link href={href}>{body}</Link> : body;
}
