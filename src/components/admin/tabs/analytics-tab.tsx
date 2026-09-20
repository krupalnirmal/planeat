'use client';

import { useQuery } from '@tanstack/react-query';
import { IndianRupee, ShoppingCart, Truck, TrendingUp, Users } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import {
  DonutChart,
  HorizontalBarChart,
  ORDER_STATUS_COLORS,
  OrdersTrendChart,
  RevenueTrendChart,
  Sparkline,
} from '@/components/admin/charts';
import type { ExplorerRange } from '@/components/admin/explorer';
import { api, qs } from '@/lib/api/client';
import { formatPaise, paise } from '@/lib/money';
import { cn } from '@/lib/utils';

/** Dashboard v2's Analytics tab (session 2026-09-19) — the default/first
    tab. Reuses the chart engine and `getDashboardAnalytics` backend built
    for the old (pre-explorer) dashboard, which stayed fully intact when
    Part K replaced that screen's rendering — this tab is the first thing
    to call `/api/admin/dashboard` again since then. The three genuinely
    new pieces (new customers, a range-scoped order-status breakdown, top
    customers, and a "vs last period" comparison) were added to that same
    backend function rather than duplicated here.

    The reference mockup's "Delivery Performance — on-time %" is
    deliberately NOT built: nothing in the schema records a promised or
    expected delivery time to compare against, so there is no real
    on-time/late distinction to show. "Delivery Outcomes" below shows the
    real Delivered/Cancelled/Failed split instead. */

export type DashboardRange = Extract<ExplorerRange, '14d' | '30d' | 'month'>;

interface DailyPoint {
  dateKey: string;
  orders: number;
  delivered: number;
  revenuePaise: string;
}

interface DashboardResponse {
  analytics: {
    dailySeries: DailyPoint[];
    orderStatusRange: Array<{ status: string; count: number }>;
    topCategories: Array<{ slug: string; name: string; revenuePaise: string }>;
    newCustomers: number;
    topCustomers: Array<{ customerId: string; customerName: string; orderCount: number; revenuePaise: string }>;
    previousPeriod: { orders: number; revenuePaise: string; delivered: number; newCustomers: number };
  };
}

/** Also passed as `DateRangeDropdown`'s `keys` prop from `dashboard-screen.tsx`,
    so the header dropdown offers exactly the 3 ranges this tab understands. */
export const ANALYTICS_RANGE_OPTIONS: DashboardRange[] = ['14d', '30d', 'month'];

/** `null` when the previous period was zero and the current isn't — no
    meaningful percentage, same rule the backend's own `pctDelta` uses for
    the today-vs-yesterday stat tiles. */
function pctDelta(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

export function AnalyticsExplorerTab({ range }: { range: DashboardRange }) {
  const t = useTranslations('admin.analytics');
  const td = useTranslations('admin.dashboard');
  const tc = useTranslations('admin.common');
  const tStatus = useTranslations('orders.status');
  const locale = useLocale();

  const metrics = useQuery({
    queryKey: ['admin-analytics', locale, range],
    queryFn: () => api.get<DashboardResponse>(`/api/admin/dashboard${qs({ locale, range })}`),
    placeholderData: (previous) => previous,
  });

  if (metrics.isLoading) return <p className="text-sm text-muted-foreground">{tc('loading')}</p>;
  const analytics = metrics.data?.analytics;
  if (!analytics) return <p className="text-sm text-danger">{tc('failed')}</p>;

  const totalOrders = analytics.dailySeries.reduce((sum, d) => sum + d.orders, 0);
  const totalDelivered = analytics.dailySeries.reduce((sum, d) => sum + d.delivered, 0);
  const totalRevenuePaise = analytics.dailySeries.reduce((sum, d) => sum + Number(paise(d.revenuePaise)), 0);
  const avgOrderValuePaise = totalOrders > 0 ? Math.round(totalRevenuePaise / totalOrders) : 0;

  const previous = analytics.previousPeriod;
  const previousRevenuePaise = Number(paise(previous.revenuePaise));
  const previousAvgOrderValuePaise = previous.orders > 0 ? Math.round(previousRevenuePaise / previous.orders) : 0;

  const sparklineOrders = analytics.dailySeries.slice(-7).map((d) => d.orders);
  const sparklineRevenue = analytics.dailySeries.slice(-7).map((d) => Number(paise(d.revenuePaise)) / 100);
  const sparklineDelivered = analytics.dailySeries.slice(-7).map((d) => d.delivered);

  const deliveryOutcomeStatuses = ['DELIVERED', 'CANCELLED', 'FAILED_DELIVERY'];
  const deliveryOutcomes = analytics.orderStatusRange.filter((s) => deliveryOutcomeStatuses.includes(s.status));

  return (
    <div>
      {/* The range control itself now lives in AdminPageHeader's action
          slot (dashboard-screen.tsx), not here — session 2026-09-20, client
          request. */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StatTile
          label={t('totalOrders')}
          value={String(totalOrders)}
          icon={ShoppingCart}
          delta={pctDelta(totalOrders, previous.orders)}
          sparklineData={sparklineOrders}
          hue="green"
        />
        <StatTile
          label={t('totalRevenue')}
          value={formatPaise(paise(BigInt(totalRevenuePaise)), { hidePaise: true })}
          icon={IndianRupee}
          delta={pctDelta(totalRevenuePaise, previousRevenuePaise)}
          sparklineData={sparklineRevenue}
          hue="violet"
        />
        <StatTile
          label={t('deliveriesCompleted')}
          value={String(totalDelivered)}
          icon={Truck}
          delta={pctDelta(totalDelivered, previous.delivered)}
          sparklineData={sparklineDelivered}
          hue="orange"
        />
        <StatTile
          label={t('newCustomers')}
          value={String(analytics.newCustomers)}
          icon={Users}
          delta={pctDelta(analytics.newCustomers, previous.newCustomers)}
          hue="blue"
        />
        <StatTile
          label={t('avgOrderValue')}
          value={formatPaise(paise(BigInt(avgOrderValuePaise)), { hidePaise: true })}
          icon={TrendingUp}
          delta={pctDelta(avgOrderValuePaise, previousAvgOrderValuePaise)}
          hue="pink"
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <ChartCard title={td('ordersTrend')}>
          <OrdersTrendChart data={analytics.dailySeries} />
        </ChartCard>
        <ChartCard title={td('revenueTrend')}>
          <RevenueTrendChart data={analytics.dailySeries} />
        </ChartCard>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <ChartCard title={t('orderStatus')}>
          {analytics.orderStatusRange.length > 0 ? (
            <DonutChart
              items={analytics.orderStatusRange.map((s) => ({
                key: s.status,
                label: tStatus(s.status),
                value: s.count,
                color: ORDER_STATUS_COLORS[s.status] ?? '#8a8a8a',
              }))}
              formatTotal={(v) => String(v)}
            />
          ) : (
            <EmptyChart label={td('noRecentSales')} />
          )}
        </ChartCard>

        <ChartCard title={td('topCategories')}>
          {analytics.topCategories.length > 0 ? (
            <HorizontalBarChart
              items={analytics.topCategories.map((c) => ({
                key: c.slug,
                label: c.name,
                value: Number(paise(c.revenuePaise)) / 100,
                color: '#2fa355',
              }))}
              valueFormat={(v) => formatPaise(paise(BigInt(Math.round(v * 100))), { hidePaise: true })}
            />
          ) : (
            <EmptyChart label={td('noRecentSales')} />
          )}
        </ChartCard>

        <ChartCard title={t('deliveryOutcomes')}>
          {deliveryOutcomes.length > 0 ? (
            <DonutChart
              items={deliveryOutcomes.map((s) => ({
                key: s.status,
                label: tStatus(s.status),
                value: s.count,
                color: ORDER_STATUS_COLORS[s.status] ?? '#8a8a8a',
              }))}
              formatTotal={(v) => String(v)}
            />
          ) : (
            <EmptyChart label={td('noRecentSales')} />
          )}
        </ChartCard>
      </div>

      <div className="mt-4">
        <ChartCard
          title={t('topCustomers')}
          action={
            <Link href="/admin/customers" className="text-xs font-semibold text-primary">
              {t('viewAll')} →
            </Link>
          }
        >
          {analytics.topCustomers.length === 0 ? (
            <EmptyChart label={td('noRecentSales')} />
          ) : (
            <ul className="divide-y divide-border">
              {analytics.topCustomers.map((customer, index) => (
                <li key={customer.customerId} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                  <span className="grid size-8 shrink-0 place-items-center rounded-full bg-tint-green text-xs font-bold text-primary-dark">
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{customer.customerName}</p>
                    <p className="text-xs text-muted-foreground">{t('ordersCount', { count: customer.orderCount })}</p>
                  </div>
                  <p className="shrink-0 text-sm font-semibold">
                    {formatPaise(paise(customer.revenuePaise), { hidePaise: true })}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </ChartCard>
      </div>
    </div>
  );
}

// Darker than the first cut (session 2026-09-19 client feedback: "too
// faint") — these tints now sit roughly halfway between the original pale
// wash and the icon's own saturated color, instead of barely tinting
// white.
const STAT_HUES = {
  green: { bg: '#CFEED9', icon: '#2fa355' },
  violet: { bg: '#DDD1F6', icon: '#4a3aa7' },
  orange: { bg: '#FBD9BC', icon: '#eb6834' },
  blue: { bg: '#CBE0FC', icon: '#2a78d6' },
  pink: { bg: '#F8CFE0', icon: '#e87ba4' },
} as const;
type StatHue = keyof typeof STAT_HUES;

function StatTile({
  label,
  value,
  icon: Icon,
  delta,
  sparklineData,
  hue,
}: {
  label: string;
  value: string;
  icon: typeof ShoppingCart;
  /** Percentage vs. the previous period, or `null` for "no real trend to
      show" (the previous period was zero). */
  delta: number | null;
  sparklineData?: number[];
  hue: StatHue;
}) {
  const t = useTranslations('admin.analytics');
  const { bg, icon } = STAT_HUES[hue];

  return (
    <div
      className="card-3d flex items-start justify-between gap-2 rounded-[var(--radius)] border border-transparent px-4 py-3"
      style={{ backgroundColor: bg }}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span
            className="grid size-8 shrink-0 place-items-center rounded-full"
            style={{ backgroundColor: `${icon}26`, color: icon }}
          >
            <Icon className="size-4" aria-hidden />
          </span>
          <p className="truncate text-xs text-muted-foreground">{label}</p>
        </div>
        <p className="mt-1.5 text-2xl font-bold tabular-nums text-foreground">{value}</p>
        <p
          className={cn(
            'mt-0.5 text-[11px] font-semibold',
            delta === null ? 'text-muted-foreground' : delta > 0 ? 'text-success' : delta < 0 ? 'text-danger' : 'text-muted-foreground',
          )}
        >
          {delta === null ? '—' : delta === 0 ? `— 0% ${t('vsLastPeriod')}` : `${delta > 0 ? '↑' : '↓'} ${Math.abs(delta)}% ${t('vsLastPeriod')}`}
        </p>
      </div>
      {sparklineData && sparklineData.some((v) => v > 0) && <Sparkline data={sparklineData} color={icon} />}
    </div>
  );
}

function ChartCard({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="card-3d rounded-[var(--radius)] border border-border/60 bg-card p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function EmptyChart({ label }: { label: string }) {
  return <p className="grid h-[120px] place-items-center text-center text-xs text-muted-foreground">{label}</p>;
}
