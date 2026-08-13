import { db } from '@/lib/db';
import { ID_PREFIX, newId } from '@/lib/ids';
import { addDays, parseDateKey, toDateKey, weekdayNumber } from '@/lib/meal-plan/pricing';
import { TEMPLATE, notifyEvent } from '@/lib/notifications/notify';
import { SETTING_KEYS, getSettingPaise } from '@/lib/settings';
import { InsufficientBalanceError, LEDGER_REF, debit, getBalance } from '@/lib/wallet/ledger';
import { istDateKeyOf } from './schedule';

/**
 * The three jobs that run around the 00:30 generation (M6, B3).
 *
 *   08:00 — retry the orders that were held for an insufficient balance
 *   20:00 — send tomorrow's preview with the exact bill, and a low-balance
 *           warning to anyone who cannot cover it
 *   daily — expire finished subscriptions and remind at T-2
 *
 * Each is idempotent and each reports enough for the admin dashboard to alert
 * on it. A silent failure in any of them is invisible until customers phone.
 */

// ─────────────────────────────────────────────────────────────
// 08:00 — retry held payments (B3)
// ─────────────────────────────────────────────────────────────

export interface RetryResult {
  targetDate: string;
  checked: number;
  paid: number;
  skippedUnpaid: number;
  failures: Array<{ orderId: string; message: string }>;
}

/**
 * B3 — "retry 08:00; still unpaid → mark that day SKIPPED_UNPAID, subscription
 * continues."
 *
 * The subscription continuing is the important half. One short morning must
 * not cancel a month the customer has already committed to; they top up and
 * tomorrow works again.
 */
export async function retryPendingPayments(now: Date = new Date()): Promise<RetryResult> {
  const targetDate = istDateKeyOf(now);
  const scheduledDate = parseDateKey(targetDate);

  const pending = await db.order.findMany({
    where: { status: 'PAYMENT_PENDING', type: 'MEAL_PLAN_DAILY', scheduledDate },
    select: {
      id: true,
      userId: true,
      orderNumber: true,
      totalPaise: true,
      subscriptionId: true,
      items: { select: { variantId: true, quantity: true } },
    },
  });

  const result: RetryResult = {
    targetDate,
    checked: pending.length,
    paid: 0,
    skippedUnpaid: 0,
    failures: [],
  };

  for (const order of pending) {
    try {
      await db.$transaction(async (tx) => {
        try {
          await debit(
            {
              userId: order.userId,
              amountPaise: order.totalPaise,
              source: 'ORDER',
              ...LEDGER_REF.order(order.id),
              note: `Daily delivery ${targetDate} (retry)`,
            },
            tx,
          );

          await tx.order.update({
            where: { id: order.id },
            data: { status: 'PLACED', paymentStatus: 'PAID' },
          });
          await tx.orderStatusHistory.create({
            data: {
              id: newId(ID_PREFIX.orderStatus),
              orderId: order.id,
              fromStatus: 'PAYMENT_PENDING',
              toStatus: 'PLACED',
              changedBy: null,
              reason: 'Payment succeeded on the 08:00 retry',
            },
          });
          result.paid += 1;
        } catch (error) {
          if (!(error instanceof InsufficientBalanceError)) throw error;

          // Still short. Give the day up, return the stock, and let the
          // subscription carry on.
          await tx.order.update({
            where: { id: order.id },
            data: { status: 'CANCELLED', cancelledAt: new Date() },
          });
          await tx.orderStatusHistory.create({
            data: {
              id: newId(ID_PREFIX.orderStatus),
              orderId: order.id,
              fromStatus: 'PAYMENT_PENDING',
              toStatus: 'CANCELLED',
              changedBy: null,
              reason: 'Still unpaid at 08:00',
            },
          });

          for (const item of order.items) {
            await tx.productVariant.updateMany({
              where: { id: item.variantId },
              data: { stockQty: { increment: item.quantity } },
            });
          }

          if (order.subscriptionId) {
            // Recorded so My Week can explain the gap, and so the 00:30 job
            // does not try again for this date.
            await tx.subscriptionException.upsert({
              where: {
                subscriptionId_date: {
                  subscriptionId: order.subscriptionId,
                  date: scheduledDate,
                },
              },
              create: {
                id: newId(ID_PREFIX.subscriptionException),
                subscriptionId: order.subscriptionId,
                date: scheduledDate,
                type: 'SKIPPED_UNPAID',
                reason: 'Wallet balance was short at 08:00',
              },
              update: { type: 'SKIPPED_UNPAID' },
            });
          }

          result.skippedUnpaid += 1;
        }
      });

      // Outside the transaction — a failed notification must not undo the work.
      const wasSkipped = result.skippedUnpaid > 0;
      await notifyEvent(
        order.userId,
        wasSkipped ? TEMPLATE.orderSkippedUnpaid : TEMPLATE.orderPaymentPending,
        { orderId: order.id, date: targetDate, amountPaise: order.totalPaise },
      );
    } catch (error) {
      result.failures.push({
        orderId: order.id,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return result;
}

// ─────────────────────────────────────────────────────────────
// 20:00 — tomorrow's preview and the low-balance warning (B3, M8)
// ─────────────────────────────────────────────────────────────

export interface PreviewResult {
  targetDate: string;
  previewed: number;
  lowBalanceWarned: number;
}

/**
 * M8 — "Tomorrow's delivery preview + exact bill (20:00)".
 * B3 — "Balance below one day's estimated cost → top-up notification at 20:00."
 *
 * Both in one pass, because they need the same computation: what tomorrow
 * costs. Telling someone their bill and separately telling them they cannot
 * pay it would be two notifications where one will do.
 */
export async function sendTomorrowPreview(now: Date = new Date()): Promise<PreviewResult> {
  const tomorrow = toDateKey(addDays(parseDateKey(istDateKeyOf(now)), 1));
  const tomorrowDate = parseDateKey(tomorrow);
  const weekday = weekdayNumber(tomorrowDate);

  const lowBalanceThreshold = await getSettingPaise(SETTING_KEYS.lowWalletThresholdPaise);

  const subscriptions = await db.subscription.findMany({
    where: {
      status: 'ACTIVE',
      startDate: { lte: tomorrowDate },
      endDate: { gte: tomorrowDate },
    },
    select: { id: true, userId: true, mealPlanId: true },
  });

  const result: PreviewResult = { targetDate: tomorrow, previewed: 0, lowBalanceWarned: 0 };

  for (const subscription of subscriptions) {
    const exception = await db.subscriptionException.findUnique({
      where: { subscriptionId_date: { subscriptionId: subscription.id, date: tomorrowDate } },
      select: { type: true },
    });
    if (exception) continue;

    const day = await db.mealPlanDay.findUnique({
      where: {
        mealPlanId_dayOfWeek: { mealPlanId: subscription.mealPlanId, dayOfWeek: weekday },
      },
      select: {
        items: {
          select: {
            slot: true,
            quantity: true,
            unit: true,
            product: { select: { nameEn: true, nameMr: true, nameHi: true } },
            variant: { select: { pricePaise: true } },
          },
        },
      },
    });

    if (!day || day.items.length === 0) continue;

    const totalPaise = day.items.reduce(
      (sum, item) => sum + (item.variant?.pricePaise ?? 0n) * BigInt(item.quantity > 0 ? 1 : 0),
      0n,
    );

    await notifyEvent(subscription.userId, TEMPLATE.tomorrowPreview, {
      date: tomorrow,
      totalPaise,
      // Names in all three languages: the template renders in whichever the
      // customer reads (R7).
      items: day.items.map((item) => ({
        slot: item.slot,
        quantity: item.quantity,
        unit: item.unit,
        nameEn: item.product.nameEn,
        nameMr: item.product.nameMr,
        nameHi: item.product.nameHi,
      })),
    });
    result.previewed += 1;

    const balance = await getBalance(subscription.userId);
    if (balance < totalPaise || balance < lowBalanceThreshold) {
      await notifyEvent(subscription.userId, TEMPLATE.lowWalletBalance, {
        balancePaise: balance,
        neededPaise: totalPaise,
        date: tomorrow,
      });
      result.lowBalanceWarned += 1;
    }
  }

  return result;
}

// ─────────────────────────────────────────────────────────────
// Expiry and the T-2 reminder (M6)
// ─────────────────────────────────────────────────────────────

export interface ExpiryResult {
  expired: number;
  remindersSent: number;
}

export async function expireSubscriptions(now: Date = new Date()): Promise<ExpiryResult> {
  const todayKey = istDateKeyOf(now);
  const today = parseDateKey(todayKey);

  // Anything whose period ended before today is finished.
  const finished = await db.subscription.findMany({
    where: { status: 'ACTIVE', endDate: { lt: today } },
    select: { id: true, userId: true },
  });

  for (const subscription of finished) {
    await db.subscription.update({
      where: { id: subscription.id },
      data: { status: 'COMPLETED' },
    });
  }

  // M6 — "Expiry reminder at T-2 days with one-tap renewal."
  const reminderDate = parseDateKey(toDateKey(addDays(today, 2)));

  const expiringSoon = await db.subscription.findMany({
    where: { status: 'ACTIVE', endDate: reminderDate },
    select: { id: true, userId: true, endDate: true },
  });

  for (const subscription of expiringSoon) {
    await notifyEvent(subscription.userId, TEMPLATE.subscriptionExpiring, {
      subscriptionId: subscription.id,
      endDate: toDateKey(subscription.endDate),
      daysLeft: 2,
    });
  }

  return { expired: finished.length, remindersSent: expiringSoon.length };
}

// ─────────────────────────────────────────────────────────────
// Cron health (M6's reliability requirement)
// ─────────────────────────────────────────────────────────────

export interface CronHealth {
  targetDate: string;
  activeSubscriptions: number;
  ordersGenerated: number;
  paymentPending: number;
  /** True when subscriptions exist but nothing was generated for them. */
  alert: boolean;
}

/**
 * M6 — "admin dashboard alerts if today's generated order count is zero, plus
 * a manual 'regenerate today' button. A silent cron failure means nobody gets
 * vegetables."
 *
 * The check lives here; Phase 8 puts it on the dashboard. The manual rerun is
 * the same `generateDailyOrders` call, authorised by an admin session instead
 * of the cron secret.
 */
export async function getCronHealth(now: Date = new Date()): Promise<CronHealth> {
  const targetDate = istDateKeyOf(now);
  const scheduledDate = parseDateKey(targetDate);

  const [activeSubscriptions, ordersGenerated, paymentPending] = await Promise.all([
    db.subscription.count({
      where: {
        status: 'ACTIVE',
        startDate: { lte: scheduledDate },
        endDate: { gte: scheduledDate },
      },
    }),
    db.order.count({ where: { type: 'MEAL_PLAN_DAILY', scheduledDate } }),
    db.order.count({
      where: { type: 'MEAL_PLAN_DAILY', scheduledDate, status: 'PAYMENT_PENDING' },
    }),
  ]);

  return {
    targetDate,
    activeSubscriptions,
    ordersGenerated,
    paymentPending,
    alert: activeSubscriptions > 0 && ordersGenerated === 0,
  };
}
