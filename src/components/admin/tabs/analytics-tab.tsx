'use client';

import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight,
  BarChart3,
  ChevronRight,
  ImageIcon,
  IndianRupee,
  Package,
  ShoppingCart,
  Truck,
  TrendingUp,
  Users,
  Warehouse,
} from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { Link } from '@/i18n/navigation';
import {
  DonutChart,
  ORDER_STATUS_COLORS,
  OrdersTrendChart,
  RevenueTrendChart,
  Sparkline,
} from '@/components/admin/charts';
import { DateRangeDropdown, type ExplorerRange } from '@/components/admin/explorer';
import { api, qs } from '@/lib/api/client';
import { CATEGORY_TILE_IMAGES } from '@/lib/catalog/category-tile-images';
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

/** The two trend charts' own range (session 2026-09-21, client reference)
    — deliberately narrower than `DashboardRange` above: it only re-slices
    the already-fetched daily series client-side, so it never needs to
    exceed what the top-level range already covers. */
type TrendRange = Extract<ExplorerRange, '7d' | '14d' | '30d'>;
const TREND_KEYS: TrendRange[] = ['7d', '14d', '30d'];
const TREND_DAYS: Record<TrendRange, number> = { '7d': 7, '14d': 14, '30d': 30 };

interface DailyPoint {
  dateKey: string;
  orders: number;
  delivered: number;
  revenuePaise: string;
}

interface RecentOrder {
  id: string;
  orderNumber: string;
  status: string;
  totalPaise: string;
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
  /** The dashboard's "Recent Orders" widget (session 2026-09-21, client
      reference) — sibling to `analytics`, not nested inside it, matching
      `DashboardMetrics`'s own real shape (`src/lib/admin/dashboard.ts`). */
  recentOrders: RecentOrder[];
}

/** Also passed as `DateRangeDropdown`'s `keys` prop from `dashboard-screen.tsx`,
    so the header dropdown offers exactly the 3 ranges this tab understands. */
export const ANALYTICS_RANGE_OPTIONS: DashboardRange[] = ['14d', '30d', 'month'];

/** Same colour-per-status convention already used for the order-status dot
    in `customer-detail-screen.tsx`'s own Recent Orders section — reused for
    visual consistency rather than a third invention of this mapping. */
const STATUS_DOT: Record<string, string> = {
  PLACED: 'bg-muted-foreground',
  CONFIRMED: 'bg-primary',
  PACKED: 'bg-primary',
  OUT_FOR_DELIVERY: 'bg-warning',
  DELIVERED: 'bg-success',
  CANCELLED: 'bg-danger',
  FAILED_DELIVERY: 'bg-danger',
  REFUNDED: 'bg-muted-foreground',
  PAYMENT_PENDING: 'bg-warning',
};

/** `null` when the previous period was zero and the current isn't — no
    meaningful percentage, same rule the backend's own `pctDelta` uses for
    the today-vs-yesterday stat tiles. */
function pctDelta(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

export function AnalyticsExplorerTab({
  range,
  onOpenTab,
}: {
  range: DashboardRange;
  /** Lets a stat tile's corner arrow switch the dashboard's own Explorer
      tab (session 2026-09-21) — owned by `AdminDashboard`, since `tab` is
      that component's state, not this one's. */
  onOpenTab: (tab: string) => void;
}) {
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

  // Real per-chart range (session 2026-09-21, client reference) — no
  // second API call: the top-level Analytics range (14d/30d/month) already
  // covers the widest of these 3, so switching this just re-slices the
  // already-fetched `dailySeries` client-side. Shared by both trend charts
  // rather than independent state, matching the reference (both show the
  // same "Last 7 days" value).
  const [trendRange, setTrendRange] = useState<TrendRange>('7d');

  if (metrics.isLoading) return <p className="text-sm text-muted-foreground">{tc('loading')}</p>;
  const analytics = metrics.data?.analytics;
  if (!analytics) return <p className="text-sm text-danger">{tc('failed')}</p>;
  const recentOrders = metrics.data?.recentOrders ?? [];

  const trendDays = TREND_DAYS[trendRange];
  const trendSeries = analytics.dailySeries.slice(-trendDays);

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
          onOpenTab={() => onOpenTab('orders')}
        />
        <StatTile
          label={t('totalRevenue')}
          value={formatPaise(paise(BigInt(totalRevenuePaise)), { hidePaise: true })}
          icon={IndianRupee}
          delta={pctDelta(totalRevenuePaise, previousRevenuePaise)}
          sparklineData={sparklineRevenue}
          hue="violet"
          onOpenTab={() => onOpenTab('revenue')}
        />
        <StatTile
          label={t('deliveriesCompleted')}
          value={String(totalDelivered)}
          icon={Truck}
          delta={pctDelta(totalDelivered, previous.delivered)}
          sparklineData={sparklineDelivered}
          hue="orange"
          onOpenTab={() => onOpenTab('deliveries')}
        />
        <StatTile
          label={t('newCustomers')}
          value={String(analytics.newCustomers)}
          icon={Users}
          delta={pctDelta(analytics.newCustomers, previous.newCustomers)}
          hue="blue"
          onOpenTab={() => onOpenTab('customers')}
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
        <ChartCard
          title={td('ordersTrend')}
          subtitle={td('ordersTrendSubtitle', { days: trendDays })}
          icon={ShoppingCart}
          hue="green"
          action={<DateRangeDropdown value={trendRange} onChange={(v) => setTrendRange(v as TrendRange)} keys={TREND_KEYS} />}
        >
          <OrdersTrendChart data={trendSeries} />
        </ChartCard>
        <ChartCard
          title={td('revenueTrend')}
          subtitle={td('revenueTrendSubtitle', { days: trendDays })}
          icon={IndianRupee}
          hue="violet"
          action={<DateRangeDropdown value={trendRange} onChange={(v) => setTrendRange(v as TrendRange)} keys={TREND_KEYS} />}
        >
          <RevenueTrendChart data={trendSeries} />
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

        {/* Photo-thumbnail cards, not a bar chart any more (session
            2026-09-21, client reference) — real data throughout
            (analytics.topCategories, unchanged), real photos too, but NOT
            cropped from the reference mockup itself: its thumbnail labels
            ("Leafy Vegetables"/"Root Vegetables") are stale subgroup names
            from before this session's own catalogue restructuring and
            don't exist in the real taxonomy any more. CATEGORY_TILE_IMAGES
            is the same real, already-curated photo set the storefront's
            own category tiles use, keyed by the real slug each category
            row already carries — a real label next to the wrong photo
            would be worse than no photo. */}
        <ChartCard title={td('topCategories')}>
          {analytics.topCategories.length > 0 ? (
            <ul className="space-y-2.5">
              {analytics.topCategories.map((c) => {
                const photo = CATEGORY_TILE_IMAGES[c.slug]?.[0];
                return (
                  <li key={c.slug} className="flex items-center gap-2.5">
                    <span className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-lg bg-secondary">
                      {photo ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={photo} alt="" className="size-full object-cover" />
                      ) : (
                        <ImageIcon className="size-4 text-muted-foreground/40" aria-hidden />
                      )}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{c.name}</span>
                    <span className="shrink-0 text-sm font-semibold text-primary">
                      {formatPaise(paise(c.revenuePaise), { hidePaise: true })}
                    </span>
                  </li>
                );
              })}
            </ul>
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

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
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

        {/* New widget (session 2026-09-21, client reference) — real data,
            reusing listAdminOrders (src/lib/admin/dashboard.ts wires it in
            via getDashboardMetrics), the same query the Orders tab itself
            calls, rather than a second "list some orders" implementation.
            Same status-dot + order# + amount + chevron row shape as
            customer-detail-screen.tsx's own Recent Orders section. */}
        <ChartCard
          title={td('recentOrders')}
          action={
            <Link href="/admin/orders" className="text-xs font-semibold text-primary">
              {td('viewAllOrders')} →
            </Link>
          }
        >
          {recentOrders.length === 0 ? (
            <EmptyChart label={td('noOrdersToday')} />
          ) : (
            <ul className="divide-y divide-border">
              {recentOrders.map((order) => (
                <Link
                  key={order.id}
                  href={`/admin/orders/${order.id}`}
                  className="flex items-center gap-2.5 py-2.5 first:pt-0 last:pb-0 hover:opacity-80"
                >
                  <span
                    className={cn('size-2 shrink-0 rounded-full', STATUS_DOT[order.status] ?? 'bg-muted-foreground')}
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-mono text-xs font-medium">{order.orderNumber}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{tStatus(order.status as never)}</p>
                  </div>
                  <p className="shrink-0 text-sm font-semibold">
                    {formatPaise(paise(order.totalPaise), { hidePaise: true })}
                  </p>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                </Link>
              ))}
            </ul>
          )}
        </ChartCard>
      </div>

      {/* New widget (session 2026-09-21, client reference) — only real,
          working destinations. The mockup's "Create Order" is dropped
          entirely rather than linked to a page that doesn't exist: there's
          no admin order-creation flow in this app. "View Reports" reuses
          the same onOpenTab mechanism the stat tiles' corner arrows use
          (Part B) to jump to the Revenue tab, rather than a standalone
          page that also doesn't exist. */}
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <ChartCard title={t('quickActions')}>
          <ul className="divide-y divide-border">
            <QuickActionRow href="/admin/catalogue/new" icon={Package} label={t('quickActionAddProduct')} />
            <QuickActionRow href="/admin/inventory" icon={Warehouse} label={t('quickActionManageInventory')} />
            <QuickActionRow href="/admin/customers" icon={Users} label={t('quickActionViewCustomers')} />
            <QuickActionRow
              onClick={() => onOpenTab('revenue')}
              icon={BarChart3}
              label={t('quickActionViewReports')}
            />
          </ul>
        </ChartCard>
      </div>
    </div>
  );
}

/** One row of the Quick Actions list — either a real `Link` to a standalone
    admin page, or a tab-switch `button` (same shape either way) when the
    destination is a tab on this same dashboard rather than its own route. */
function QuickActionRow({
  icon: Icon,
  label,
  href,
  onClick,
}: {
  icon: typeof Package;
  label: string;
  href?: string;
  onClick?: () => void;
}) {
  const content = (
    <>
      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-tint-green text-primary">
        <Icon className="size-4" aria-hidden />
      </span>
      <span className="min-w-0 flex-1 text-sm font-medium">{label}</span>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
    </>
  );
  const className = 'flex items-center gap-3 py-2.5 first:pt-0 last:pb-0 hover:opacity-80';

  return (
    <li>
      {href ? (
        <Link href={href} className={className}>
          {content}
        </Link>
      ) : (
        <button type="button" onClick={onClick} className={cn('w-full text-left', className)}>
          {content}
        </button>
      )}
    </li>
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
  onOpenTab,
}: {
  label: string;
  value: string;
  icon: typeof ShoppingCart;
  /** Percentage vs. the previous period, or `null` for "no real trend to
      show" (the previous period was zero). */
  delta: number | null;
  sparklineData?: number[];
  hue: StatHue;
  /** Switches the *dashboard's own* Explorer tab (session 2026-09-21,
      client reference) — not a `Link` to a standalone page, since Revenue
      and Deliveries have no standalone `/admin/*` route of their own, only
      a tab right here on this same page. Omitted (no arrow shown) for Avg
      Order Value, which has no matching tab at all — a real, working
      shortcut or nothing, never a decorative no-op. */
  onOpenTab?: () => void;
}) {
  const t = useTranslations('admin.analytics');
  const { bg, icon } = STAT_HUES[hue];

  return (
    <div
      className="card-3d relative flex items-start justify-between gap-2 rounded-[var(--radius)] border border-transparent px-4 py-3"
      style={{ backgroundColor: bg }}
    >
      {onOpenTab && (
        <button
          type="button"
          onClick={onOpenTab}
          aria-label={label}
          className="absolute top-2.5 right-2.5 grid size-7 shrink-0 place-items-center rounded-full bg-card/70 text-foreground transition-transform hover:scale-105"
        >
          <ArrowRight className="size-3.5" aria-hidden />
        </button>
      )}
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
  subtitle,
  icon: Icon,
  hue,
  action,
  children,
}: {
  title: string;
  /** Session 2026-09-21, client reference — e.g. "Total orders placed in
      the last 7 days". Optional since only the two trend charts have one
      in the mockup; the donut/bar/list cards below them don't. */
  subtitle?: string;
  icon?: typeof ShoppingCart;
  hue?: StatHue;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  const iconColor = hue ? STAT_HUES[hue].icon : undefined;

  return (
    <section className="card-3d rounded-[var(--radius)] border border-border/60 bg-card p-4">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          {Icon && (
            <span
              className="grid size-8 shrink-0 place-items-center rounded-full"
              style={{ backgroundColor: `${iconColor}26`, color: iconColor }}
            >
              <Icon className="size-4" aria-hidden />
            </span>
          )}
          <div className="min-w-0">
            <h2 className="text-sm font-semibold">{title}</h2>
            {subtitle && <p className="truncate text-xs text-muted-foreground">{subtitle}</p>}
          </div>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function EmptyChart({ label }: { label: string }) {
  return <p className="grid h-[120px] place-items-center text-center text-xs text-muted-foreground">{label}</p>;
}
