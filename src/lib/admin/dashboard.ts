import type { Locale, OrderStatus, PaymentMethod } from '@/generated/prisma/enums';
import { db } from '@/lib/db';
import { pickName } from '@/lib/catalog/text';
import { parseDateKey } from '@/lib/meal-plan/pricing';
import { getCronHealth, type CronHealth } from '@/lib/subscription/daily-jobs';
import { istDateKeyOf } from '@/lib/subscription/schedule';

const TREND_DAYS = 14;
const RECENT_WINDOW_DAYS = 7;

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

  waitlistTotal: number;
  /** B11 — where the demand is, so the owner knows where to expand. */
  waitlistTopPincodes: Array<{ pincode: string; count: number }>;

  cron: CronHealth;

  analytics: DashboardAnalytics;
}

/**
 * The dashboard's charts (session 2026-09-17) — every number here is real,
 * queried the same way the stat tiles above are; nothing is placeholder or
 * sample data. Kept as a nested object rather than flattened onto
 * `DashboardMetrics` so the chart-feeding shape stays obviously distinct
 * from the single-value stat tiles.
 */
export interface DashboardAnalytics {
  /** Orders placed + revenue actually paid, per day, oldest first — always
      exactly `TREND_DAYS` entries, zero-filled for a day with no orders. */
  dailySeries: Array<{ dateKey: string; orders: number; revenuePaise: bigint }>;
  /** Today's orders by status — the pipeline snapshot, not history. */
  orderStatusToday: Array<{ status: OrderStatus; count: number }>;
  /** Revenue by category over the last `RECENT_WINDOW_DAYS`, paid orders
      only, highest first, capped at 6 (the categorical-palette ceiling). */
  topCategories: Array<{ slug: string; name: string; revenuePaise: bigint }>;
  /** Orders by payment method over the last `RECENT_WINDOW_DAYS`. */
  paymentMethodSplit: Array<{ method: PaymentMethod; count: number; revenuePaise: bigint }>;
}

async function getDashboardAnalytics(now: Date, locale: Locale): Promise<DashboardAnalytics> {
  const dateKey = istDateKeyOf(now);
  const dayStart = new Date(`${dateKey}T00:00:00.000Z`);
  const dayEnd = new Date(`${dateKey}T23:59:59.999Z`);
  const trendStart = new Date(now.getTime() - (TREND_DAYS - 1) * 86_400_000);
  const recentStart = new Date(now.getTime() - RECENT_WINDOW_DAYS * 86_400_000);

  const [trendOrders, todayStatusGroups, recentItems, paymentGroups] = await Promise.all([
    // Bucketed in memory by IST date-key rather than a DB-side date-trunc
    // groupBy (Prisma has none for MySQL) — the same trade-off this file
    // already makes for low-stock filtering, and fine at this data volume.
    db.order.findMany({
      where: { placedAt: { gte: trendStart } },
      select: { placedAt: true, totalPaise: true, paymentStatus: true },
    }),

    db.order.groupBy({
      by: ['status'],
      where: { placedAt: { gte: dayStart, lte: dayEnd } },
      _count: { status: true },
    }),

    // No `categorySnapshot` on OrderItem, so the category comes from the
    // live product via its variant — the same join path `getPlanColumns`
    // uses for its own category rollups.
    db.orderItem.findMany({
      where: {
        order: { placedAt: { gte: recentStart }, paymentStatus: 'PAID' },
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
      where: { placedAt: { gte: recentStart } },
      _count: { paymentMethod: true },
      _sum: { totalPaise: true },
    }),
  ]);

  const byDay = new Map<string, { orders: number; revenuePaise: bigint }>();
  for (const order of trendOrders) {
    const key = istDateKeyOf(order.placedAt);
    const bucket = byDay.get(key) ?? { orders: 0, revenuePaise: 0n };
    bucket.orders += 1;
    if (order.paymentStatus === 'PAID') bucket.revenuePaise += order.totalPaise;
    byDay.set(key, bucket);
  }
  const dailySeries: DashboardAnalytics['dailySeries'] = [];
  for (let i = TREND_DAYS - 1; i >= 0; i--) {
    const key = istDateKeyOf(new Date(now.getTime() - i * 86_400_000));
    const bucket = byDay.get(key) ?? { orders: 0, revenuePaise: 0n };
    dailySeries.push({ dateKey: key, ...bucket });
  }

  const byCategory = new Map<string, { name: string; revenuePaise: bigint }>();
  for (const item of recentItems) {
    const category = item.variant.product.category;
    const existing = byCategory.get(category.slug);
    if (existing) existing.revenuePaise += item.totalPaise;
    else byCategory.set(category.slug, { name: pickName(category, locale), revenuePaise: item.totalPaise });
  }
  const topCategories = [...byCategory.entries()]
    .map(([slug, v]) => ({ slug, ...v }))
    .sort((a, b) => (b.revenuePaise > a.revenuePaise ? 1 : b.revenuePaise < a.revenuePaise ? -1 : 0))
    .slice(0, 6);

  return {
    dailySeries,
    orderStatusToday: todayStatusGroups.map((g) => ({ status: g.status, count: g._count.status })),
    topCategories,
    paymentMethodSplit: paymentGroups.map((g) => ({
      method: g.paymentMethod,
      count: g._count.paymentMethod,
      revenuePaise: g._sum.totalPaise ?? 0n,
    })),
  };
}

export async function getDashboardMetrics(
  now: Date = new Date(),
  locale: Locale = 'en',
): Promise<DashboardMetrics> {
  const dateKey = istDateKeyOf(now);
  const scheduledDate = parseDateKey(dateKey);

  const dayStart = new Date(`${dateKey}T00:00:00.000Z`);
  const dayEnd = new Date(`${dateKey}T23:59:59.999Z`);
  const twoDaysOut = new Date(scheduledDate.getTime() + 2 * 86_400_000);

  const [
    todayOrders,
    revenue,
    todayDelivered,
    todayPaymentPending,
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
      select: { stockQty: true, lowStockThreshold: true },
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
    getDashboardAnalytics(now, locale),
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
    outOfStockCount,
    waitlistTotal,
    waitlistTopPincodes: waitlistGroups.map((group) => ({
      pincode: group.pincode,
      count: group._count.pincode,
    })),
    cron,
    analytics,
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
