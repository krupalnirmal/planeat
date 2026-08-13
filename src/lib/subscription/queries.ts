import { db } from '@/lib/db';
import { toDateKey } from '@/lib/meal-plan/pricing';
import { SETTING_KEYS, getSettingNumber } from '@/lib/settings';
import { getBalance } from '@/lib/wallet/ledger';
import type { DeliverySlot, SubscriptionStatus } from '@/generated/prisma/enums';
import { buildSchedule, dateRange, istDateKeyOf, type ScheduleDay } from './schedule';

/**
 * Reads for M6's "My Week": the next 7 days with a per-day status, and enough
 * about the subscription to manage it.
 */

export interface SubscriptionView {
  id: string;
  status: SubscriptionStatus;
  startDate: string;
  endDate: string;
  deliverySlot: DeliverySlot;
  planFeePaise: bigint;
  prepaidPaise: bigint;
  mealPlanId: string;
  address: {
    id: string;
    label: string;
    line1: string;
    city: string;
    pincode: string;
  };
  walletBalancePaise: bigint;
  /** M6 — the T-2 renewal prompt, surfaced in the UI as well as by push. */
  daysUntilEnd: number;
}

export async function getCurrentSubscription(
  userId: string,
): Promise<SubscriptionView | null> {
  const subscription = await db.subscription.findFirst({
    where: { userId, status: { in: ['ACTIVE', 'PAUSED'] } },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      status: true,
      startDate: true,
      endDate: true,
      deliverySlot: true,
      planFeePaise: true,
      prepaidPaise: true,
      mealPlanId: true,
      address: { select: { id: true, label: true, line1: true, city: true, pincode: true } },
    },
  });

  if (!subscription) return null;

  const balance = await getBalance(userId);
  const todayKey = istDateKeyOf(new Date());
  const endKey = toDateKey(subscription.endDate);

  const daysUntilEnd = Math.max(
    0,
    Math.round(
      (Date.parse(`${endKey}T00:00:00Z`) - Date.parse(`${todayKey}T00:00:00Z`)) / 86_400_000,
    ),
  );

  return {
    id: subscription.id,
    status: subscription.status,
    startDate: toDateKey(subscription.startDate),
    endDate: endKey,
    deliverySlot: subscription.deliverySlot,
    planFeePaise: subscription.planFeePaise,
    prepaidPaise: subscription.prepaidPaise,
    mealPlanId: subscription.mealPlanId,
    address: subscription.address,
    walletBalancePaise: balance,
    daysUntilEnd,
  };
}

export interface WeekDayView extends ScheduleDay {
  orderId: string | null;
  totalPaise: bigint | null;
  items: Array<{
    slot: string;
    name: string;
    quantity: number;
    unit: string;
    isSubstituted: boolean;
  }>;
}

export interface WeekView {
  subscriptionId: string;
  days: WeekDayView[];
}

/**
 * M6 — "My Week screen: next 7 days with per-day status."
 *
 * Three queries regardless of how many days are asked for: the subscription,
 * every order in the window, and every exception in the window. Looping a
 * query per day would be seven round trips to Singapore for one screen.
 */
export async function getWeekSchedule(
  subscriptionId: string,
  userId: string,
  days = 7,
  now: Date = new Date(),
): Promise<WeekView | null> {
  const subscription = await db.subscription.findUnique({
    where: { id: subscriptionId },
    select: { id: true, userId: true, startDate: true, endDate: true },
  });

  // R9 — ownership is checked here, not by trusting the id.
  if (!subscription || subscription.userId !== userId) return null;

  const fromKey = istDateKeyOf(now);
  const keys = dateRange(fromKey, days);
  const fromDate = new Date(`${keys[0]}T00:00:00.000Z`);
  const toDate = new Date(`${keys[keys.length - 1]}T00:00:00.000Z`);

  const [orders, exceptions, cutoffHour] = await Promise.all([
    db.order.findMany({
      where: {
        subscriptionId,
        scheduledDate: { gte: fromDate, lte: toDate },
      },
      select: {
        id: true,
        status: true,
        totalPaise: true,
        scheduledDate: true,
        items: {
          select: {
            mealSlot: true,
            nameSnapshot: true,
            quantity: true,
            isSubstituted: true,
            variant: { select: { unit: true } },
          },
        },
      },
    }),
    db.subscriptionException.findMany({
      where: { subscriptionId, date: { gte: fromDate, lte: toDate } },
      select: { date: true, type: true },
    }),
    getSettingNumber(SETTING_KEYS.skipCutoffHour),
  ]);

  const ordersByDate = new Map(
    orders.map((order) => [toDateKey(order.scheduledDate ?? fromDate), order]),
  );
  const exceptionsByDate = new Map(
    exceptions.map((exception) => [toDateKey(exception.date), exception.type]),
  );

  const schedule = buildSchedule(
    keys.map((dateKey) => ({
      dateKey,
      orderStatus: ordersByDate.get(dateKey)?.status ?? null,
      exceptionType: exceptionsByDate.get(dateKey) ?? null,
    })),
    {
      startDateKey: toDateKey(subscription.startDate),
      endDateKey: toDateKey(subscription.endDate),
    },
    now,
    cutoffHour,
  );

  return {
    subscriptionId,
    days: schedule.map((day) => {
      const order = ordersByDate.get(day.dateKey);
      return {
        ...day,
        orderId: order?.id ?? null,
        totalPaise: order?.totalPaise ?? null,
        items:
          order?.items.map((item) => ({
            slot: item.mealSlot ?? 'MORNING',
            name: item.nameSnapshot,
            quantity: item.quantity,
            unit: item.variant?.unit ?? 'G',
            isSubstituted: item.isSubstituted,
          })) ?? [],
      };
    }),
  };
}
