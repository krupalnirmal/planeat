import { db } from '@/lib/db';
import { parseDateKey } from '@/lib/meal-plan/pricing';
import { getCronHealth, type CronHealth } from '@/lib/subscription/daily-jobs';
import { istDateKeyOf } from '@/lib/subscription/schedule';

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
}

export async function getDashboardMetrics(now: Date = new Date()): Promise<DashboardMetrics> {
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
