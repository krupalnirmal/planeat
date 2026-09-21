import type { Locale, OrderStatus, PaymentMethod } from '@/generated/prisma/enums';
import { db } from '@/lib/db';
import { pickName } from '@/lib/catalog/text';
import { listAdminOrders, type AdminOrderRow } from '@/lib/admin/orders';
import { parseDateKey } from '@/lib/meal-plan/pricing';
import { getCronHealth, type CronHealth } from '@/lib/subscription/daily-jobs';
import { istDateKeyOf } from '@/lib/subscription/schedule';

/** The dashboard's own date-range control (session 2026-09-17) — matches the
    3 presets the client's reference mockup shows as pills, now a single
    control above the whole analytics section rather than one per chart. */
export type DashboardRange = '14d' | '30d' | 'month';

function resolveRange(range: DashboardRange, now: Date): { start: Date; days: number } {
  if (range === 'month') {
    const [year, month] = istDateKeyOf(now).split('-');
    const monthStart = new Date(`${year}-${month}-01T00:00:00.000Z`);
    const days = Math.floor((now.getTime() - monthStart.getTime()) / 86_400_000) + 1;
    return { start: monthStart, days };
  }
  const days = range === '30d' ? 30 : 14;
  return { start: new Date(now.getTime() - (days - 1) * 86_400_000), days };
}

/**
 * M9 dashboard — "Today's orders, revenue, active subscriptions, low stock,
 * cron health."
 *
 * Ordered by what the owner needs to act on, not by what is easy to count.
 * Cron health is the one alarm rather than a statistic (M6) — a silent
 * generation failure means nobody gets vegetables, and the owner finds out
 * from phone calls at 07:00.
 */

export interface DashboardMetrics {
  dateKey: string;

  todayOrders: number;
  todayRevenuePaise: bigint;
  todayDelivered: number;
  todayPaymentPending: number;

  activeSubscriptions: number;
  pausedSubscriptions: number;
  expiringWithin2Days: number;

  openOrderIssues: number;

  lowStockCount: number;
  outOfStockCount: number;
  /** The dashboard's own "Quick Info" widget (session 2026-09-21, client
      reference) — the first few low-stock product names, so the owner sees
      *what* to reorder without opening the Inventory tab first. Same
      variants `lowStockCount` already counts, just carrying names too. */
  lowStockProducts: string[];

  waitlistTotal: number;
  /** B11 — where the demand is, so the owner knows where to expand. */
  waitlistTopPincodes: Array<{ pincode: string; count: number }>;

  cron: CronHealth;

  /** Today vs. yesterday — always this exact comparison regardless of the
      analytics `range`, since a stat tile's delta is a fixed idea ("how did
      today go so far") independent of whichever trend window the charts
      below happen to be showing. */
  deltas: DashboardDeltas;

  analytics: DashboardAnalytics;

  /** The dashboard's own "Recent Orders" widget (session 2026-09-21, client
      reference) — the last 5 orders, reusing `listAdminOrders` (the same
      query the Orders tab itself calls) rather than a second
      implementation of "list some orders." */
  recentOrders: AdminOrderRow[];
}

/**
 * The dashboard's charts (session 2026-09-17) — every number here is real,
 * queried the same way the stat tiles above are; nothing is placeholder or
 * sample data. Kept as a nested object rather than flattened onto
 * `DashboardMetrics` so the chart-feeding shape stays obviously distinct
 * from the single-value stat tiles.
 */
export interface DashboardAnalytics {
  range: DashboardRange;
  /** Orders placed + delivered + revenue actually paid, per day, oldest
      first — one entry per day in the selected range, zero-filled for a day
      with no orders. */
  dailySeries: Array<{ dateKey: string; orders: number; delivered: number; revenuePaise: bigint }>;
  /** Today's orders by status — the pipeline snapshot, not history; always
      today regardless of `range` (a "pipeline" only means anything for the
      day in progress). */
  orderStatusToday: Array<{ status: OrderStatus; count: number }>;
  /** The Analytics tab's own "Order Status" donut (session 2026-09-19) —
      every order placed within the selected range, not just today's
      pipeline. A separate field from `orderStatusToday` rather than
      replacing it, since the two answer different questions ("what's
      happening right now" vs. "how did the range break down"). */
  orderStatusRange: Array<{ status: OrderStatus; count: number }>;
  /** Revenue by category over the selected range, paid orders only, highest
      first, capped at 6 (the categorical-palette ceiling). */
  topCategories: Array<{ slug: string; name: string; revenuePaise: bigint }>;
  /** Orders by payment method over the selected range. */
  paymentMethodSplit: Array<{ method: PaymentMethod; count: number; revenuePaise: bigint }>;
  /** New customer accounts created within the range (session 2026-09-19,
      Analytics tab). */
  newCustomers: number;
  /** The 5 customers with the most revenue in the range, highest first. */
  topCustomers: Array<{ customerId: string; customerName: string; orderCount: number; revenuePaise: bigint }>;
  /** The same-length window immediately before `rangeStart` — what every
      Analytics stat tile's "vs last period" delta is computed against,
      the range-aware equivalent of `DashboardDeltas`'s fixed
      today-vs-yesterday comparison. */
  previousPeriod: {
    orders: number;
    revenuePaise: bigint;
    delivered: number;
    newCustomers: number;
  };
}

async function getDashboardAnalytics(
  now: Date,
  locale: Locale,
  range: DashboardRange,
): Promise<DashboardAnalytics> {
  const dateKey = istDateKeyOf(now);
  const dayStart = new Date(`${dateKey}T00:00:00.000Z`);
  const dayEnd = new Date(`${dateKey}T23:59:59.999Z`);
  const { start: rangeStart, days } = resolveRange(range, now);
  // The Analytics tab's "vs last period" comparison window — the same
  // length as the selected range, immediately before it.
  const previousStart = new Date(rangeStart.getTime() - days * 86_400_000);

  const [
    rangeOrders,
    todayStatusGroups,
    rangeStatusGroups,
    rangeItems,
    paymentGroups,
    newCustomers,
    topCustomerGroups,
    previousOrdersCount,
    previousRevenue,
    previousDeliveredCount,
    previousNewCustomers,
  ] = await Promise.all([
    // Bucketed in memory by IST date-key rather than a DB-side date-trunc
    // groupBy (Prisma has none for MySQL) — the same trade-off this file
    // already makes for low-stock filtering, and fine at this data volume.
    db.order.findMany({
      where: { placedAt: { gte: rangeStart } },
      select: { placedAt: true, deliveredAt: true, totalPaise: true, paymentStatus: true },
    }),

    db.order.groupBy({
      by: ['status'],
      where: { placedAt: { gte: dayStart, lte: dayEnd } },
      _count: { status: true },
    }),

    // Same shape, scoped to the whole selected range instead of just today
    // — the Analytics tab's "Order Status" donut.
    db.order.groupBy({
      by: ['status'],
      where: { placedAt: { gte: rangeStart } },
      _count: { status: true },
    }),

    // No `categorySnapshot` on OrderItem, so the category comes from the
    // live product via its variant — the same join path `getPlanColumns`
    // uses for its own category rollups.
    db.orderItem.findMany({
      where: {
        order: { placedAt: { gte: rangeStart }, paymentStatus: 'PAID' },
      },
      select: {
        totalPaise: true,
        variant: {
          select: {
            product: {
              select: { category: { select: { slug: true, nameEn: true, nameMr: true, nameHi: true } } },
            },
          },
        },
      },
    }),

    db.order.groupBy({
      by: ['paymentMethod'],
      where: { placedAt: { gte: rangeStart } },
      _count: { paymentMethod: true },
      _sum: { totalPaise: true },
    }),

    db.user.count({ where: { role: 'CUSTOMER', createdAt: { gte: rangeStart } } }),

    // Top 5 by revenue in the range — paid orders only, same "what was
    // actually paid" rule the rest of this file already uses for revenue.
    db.order.groupBy({
      by: ['userId'],
      where: { placedAt: { gte: rangeStart }, paymentStatus: 'PAID' },
      _sum: { totalPaise: true },
      _count: { id: true },
      orderBy: { _sum: { totalPaise: 'desc' } },
      take: 5,
    }),

    // ── The previous period, same length, for every stat tile's delta.
    db.order.count({ where: { placedAt: { gte: previousStart, lt: rangeStart } } }),
    db.order.aggregate({
      where: { placedAt: { gte: previousStart, lt: rangeStart }, paymentStatus: 'PAID' },
      _sum: { totalPaise: true },
    }),
    db.order.count({ where: { deliveredAt: { gte: previousStart, lt: rangeStart } } }),
    db.user.count({ where: { role: 'CUSTOMER', createdAt: { gte: previousStart, lt: rangeStart } } }),
  ]);

  const byDay = new Map<string, { orders: number; delivered: number; revenuePaise: bigint }>();
  for (const order of rangeOrders) {
    const key = istDateKeyOf(order.placedAt);
    const bucket = byDay.get(key) ?? { orders: 0, delivered: 0, revenuePaise: 0n };
    bucket.orders += 1;
    if (order.paymentStatus === 'PAID') bucket.revenuePaise += order.totalPaise;
    byDay.set(key, bucket);
  }
  // Delivered counts its own day separately — an order placed on day N can
  // deliver on day N+1, so this is a second pass keyed by `deliveredAt`, not
  // folded into the `placedAt` loop above.
  for (const order of rangeOrders) {
    if (!order.deliveredAt) continue;
    const key = istDateKeyOf(order.deliveredAt);
    const bucket = byDay.get(key);
    if (bucket) bucket.delivered += 1;
  }
  const dailySeries: DashboardAnalytics['dailySeries'] = [];
  for (let i = days - 1; i >= 0; i--) {
    const key = istDateKeyOf(new Date(now.getTime() - i * 86_400_000));
    const bucket = byDay.get(key) ?? { orders: 0, delivered: 0, revenuePaise: 0n };
    dailySeries.push({ dateKey: key, ...bucket });
  }

  const byCategory = new Map<string, { name: string; revenuePaise: bigint }>();
  for (const item of rangeItems) {
    const category = item.variant.product.category;
    const existing = byCategory.get(category.slug);
    if (existing) existing.revenuePaise += item.totalPaise;
    else byCategory.set(category.slug, { name: pickName(category, locale), revenuePaise: item.totalPaise });
  }
  const topCategories = [...byCategory.entries()]
    .map(([slug, v]) => ({ slug, ...v }))
    .sort((a, b) => (b.revenuePaise > a.revenuePaise ? 1 : b.revenuePaise < a.revenuePaise ? -1 : 0))
    .slice(0, 6);

  // `groupBy` has no join, so the top customers' names need a second,
  // small lookup (at most 5 rows) rather than a raw userId in the UI.
  const topCustomerIds = topCustomerGroups.map((g) => g.userId);
  const topCustomerUsers =
    topCustomerIds.length > 0
      ? await db.user.findMany({ where: { id: { in: topCustomerIds } }, select: { id: true, name: true, phone: true } })
      : [];
  const topCustomerNameById = new Map(topCustomerUsers.map((u) => [u.id, u.name ?? u.phone]));

  return {
    range,
    dailySeries,
    orderStatusToday: todayStatusGroups.map((g) => ({ status: g.status, count: g._count.status })),
    orderStatusRange: rangeStatusGroups.map((g) => ({ status: g.status, count: g._count.status })),
    topCategories,
    paymentMethodSplit: paymentGroups.map((g) => ({
      method: g.paymentMethod,
      count: g._count.paymentMethod,
      revenuePaise: g._sum.totalPaise ?? 0n,
    })),
    newCustomers,
    topCustomers: topCustomerGroups.map((g) => ({
      customerId: g.userId,
      customerName: topCustomerNameById.get(g.userId) ?? g.userId,
      orderCount: g._count.id,
      revenuePaise: g._sum.totalPaise ?? 0n,
    })),
    previousPeriod: {
      orders: previousOrdersCount,
      revenuePaise: previousRevenue._sum.totalPaise ?? 0n,
      delivered: previousDeliveredCount,
      newCustomers: previousNewCustomers,
    },
  };
}

/** `null` — no meaningful percentage to show (yesterday was zero and today
    isn't, so any % would be an artifact of the small base, not a real
    trend). The UI shows a plain "New" badge in that case instead of a
    number. */
function pctDelta(today: number, yesterday: number): number | null {
  if (yesterday === 0) return today === 0 ? 0 : null;
  return Math.round(((today - yesterday) / yesterday) * 1000) / 10;
}

export interface DashboardDeltas {
  orders: number | null;
  revenue: number | null;
  delivered: number | null;
}

export async function getDashboardMetrics(
  now: Date = new Date(),
  locale: Locale = 'en',
  range: DashboardRange = '14d',
): Promise<DashboardMetrics> {
  const dateKey = istDateKeyOf(now);
  const scheduledDate = parseDateKey(dateKey);

  const dayStart = new Date(`${dateKey}T00:00:00.000Z`);
  const dayEnd = new Date(`${dateKey}T23:59:59.999Z`);
  const yesterdayStart = new Date(dayStart.getTime() - 86_400_000);
  const yesterdayEnd = new Date(dayEnd.getTime() - 86_400_000);
  const twoDaysOut = new Date(scheduledDate.getTime() + 2 * 86_400_000);

  const [
    todayOrders,
    revenue,
    todayDelivered,
    todayPaymentPending,
    yesterdayOrders,
    yesterdayRevenue,
    yesterdayDelivered,
    activeSubscriptions,
    pausedSubscriptions,
    expiringWithin2Days,
    openOrderIssues,
    lowStockVariants,
    outOfStockCount,
    waitlistTotal,
    waitlistGroups,
    cron,
    analytics,
    recent,
  ] = await Promise.all([
    db.order.count({ where: { placedAt: { gte: dayStart, lte: dayEnd } } }),

    // Revenue counts what was actually paid. An order still PAYMENT_PENDING is
    // not revenue, and counting it would flatter the number on exactly the
    // mornings the owner most needs the truth.
    db.order.aggregate({
      where: { placedAt: { gte: dayStart, lte: dayEnd }, paymentStatus: 'PAID' },
      _sum: { totalPaise: true },
    }),

    db.order.count({ where: { deliveredAt: { gte: dayStart, lte: dayEnd } } }),
    db.order.count({ where: { status: 'PAYMENT_PENDING' } }),

    // Yesterday's equivalents — feed `deltas` only, same "what was actually
    // paid" rule as today's revenue above.
    db.order.count({ where: { placedAt: { gte: yesterdayStart, lte: yesterdayEnd } } }),
    db.order.aggregate({
      where: { placedAt: { gte: yesterdayStart, lte: yesterdayEnd }, paymentStatus: 'PAID' },
      _sum: { totalPaise: true },
    }),
    db.order.count({ where: { deliveredAt: { gte: yesterdayStart, lte: yesterdayEnd } } }),

    db.subscription.count({ where: { status: 'ACTIVE' } }),
    db.subscription.count({ where: { status: 'PAUSED' } }),
    db.subscription.count({
      where: { status: 'ACTIVE', endDate: { gte: scheduledDate, lte: twoDaysOut } },
    }),

    db.orderIssue.count({ where: { status: 'OPEN' } }),

    // Prisma cannot compare two columns in a `where`, so low stock is filtered
    // in memory over the small set of variants that are low by any measure.
    db.productVariant.findMany({
      where: { isActive: true, stockQty: { gt: 0, lte: 50 } },
      select: {
        stockQty: true,
        lowStockThreshold: true,
        product: { select: { nameEn: true, nameMr: true, nameHi: true } },
      },
    }),
    db.productVariant.count({ where: { isActive: true, stockQty: { lte: 0 } } }),

    db.waitlist.count(),
    db.waitlist.groupBy({
      by: ['pincode'],
      _count: { pincode: true },
      orderBy: { _count: { pincode: 'desc' } },
      take: 5,
    }),

    getCronHealth(now),
    getDashboardAnalytics(now, locale, range),
    listAdminOrders({}, { skip: 0, take: 5 }),
  ]);

  return {
    dateKey,
    todayOrders,
    todayRevenuePaise: revenue._sum.totalPaise ?? 0n,
    todayDelivered,
    todayPaymentPending,
    activeSubscriptions,
    pausedSubscriptions,
    expiringWithin2Days,
    openOrderIssues,
    lowStockCount: lowStockVariants.filter(
      (variant) => variant.stockQty <= variant.lowStockThreshold,
    ).length,
    lowStockProducts: lowStockVariants
      .filter((variant) => variant.stockQty <= variant.lowStockThreshold)
      .slice(0, 3)
      .map((variant) => pickName(variant.product, locale)),
    outOfStockCount,
    waitlistTotal,
    waitlistTopPincodes: waitlistGroups.map((group) => ({
      pincode: group.pincode,
      count: group._count.pincode,
    })),
    cron,
    deltas: {
      orders: pctDelta(todayOrders, yesterdayOrders),
      revenue: pctDelta(Number(revenue._sum.totalPaise ?? 0n), Number(yesterdayRevenue._sum.totalPaise ?? 0n)),
      delivered: pctDelta(todayDelivered, yesterdayDelivered),
    },
    analytics,
    recentOrders: recent.orders,
  };
}

/** B11 — the full waitlist demand map, for the expansion decision. */
export async function getWaitlistByPincode(): Promise<
  Array<{ pincode: string; count: number; latest: Date }>
> {
  const groups = await db.waitlist.groupBy({
    by: ['pincode'],
    _count: { pincode: true },
    _max: { createdAt: true },
    orderBy: { _count: { pincode: 'desc' } },
  });

  return groups.map((group) => ({
    pincode: group.pincode,
    count: group._count.pincode,
    latest: group._max.createdAt ?? new Date(0),
  }));
}
