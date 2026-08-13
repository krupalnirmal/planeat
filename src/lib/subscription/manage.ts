import { db } from '@/lib/db';
import { ID_PREFIX, newId } from '@/lib/ids';
import { addDays, parseDateKey, toDateKey } from '@/lib/meal-plan/pricing';
import { TEMPLATE, notifyEvent } from '@/lib/notifications/notify';
import { SETTING_KEYS, getSettingNumber } from '@/lib/settings';
import { LEDGER_REF, credit } from '@/lib/wallet/ledger';
import type { DeliverySlot } from '@/generated/prisma/enums';
import { canSkipDate, istDateKeyOf, remainingDays, totalDays } from './schedule';

/**
 * M6 — skip a day, pause a range, resume, cancel, and change slot or address
 * for future deliveries.
 *
 * Everything here is scoped to the caller's own subscription (R9) and every
 * date rule goes through `schedule.ts`, so "can I still skip tomorrow?" has
 * one answer rather than one per surface.
 */

async function ownedSubscription(subscriptionId: string, userId: string) {
  const subscription = await db.subscription.findUnique({
    where: { id: subscriptionId },
    select: {
      id: true,
      userId: true,
      status: true,
      startDate: true,
      endDate: true,
      planFeePaise: true,
    },
  });
  if (!subscription || subscription.userId !== userId) return null;
  return subscription;
}

// ─────────────────────────────────────────────────────────────
// Skip one day
// ─────────────────────────────────────────────────────────────

export type SkipResult =
  | { ok: true; dateKey: string }
  | { ok: false; reason: 'NOT_FOUND' | 'TOO_LATE' | 'OUTSIDE_PERIOD' | 'ALREADY_GENERATED' };

/**
 * M6 — "Skip a day (before 20:00 previous day)."
 *
 * Past the cutoff the picklist is being prepared and the preview has already
 * gone out with tomorrow's exact bill.
 */
export async function skipDay(
  subscriptionId: string,
  userId: string,
  dateKey: string,
  now: Date = new Date(),
): Promise<SkipResult> {
  const subscription = await ownedSubscription(subscriptionId, userId);
  if (!subscription) return { ok: false, reason: 'NOT_FOUND' };

  const startKey = toDateKey(subscription.startDate);
  const endKey = toDateKey(subscription.endDate);
  if (dateKey < startKey || dateKey > endKey) return { ok: false, reason: 'OUTSIDE_PERIOD' };

  const cutoffHour = await getSettingNumber(SETTING_KEYS.skipCutoffHour);
  if (!canSkipDate(dateKey, now, cutoffHour)) return { ok: false, reason: 'TOO_LATE' };

  const date = parseDateKey(dateKey);

  // If the cron already ran for this date, the vegetables are allocated and
  // the order is real. Skipping is no longer a note in a table.
  const existingOrder = await db.order.findFirst({
    where: { subscriptionId, scheduledDate: date },
    select: { id: true },
  });
  if (existingOrder) return { ok: false, reason: 'ALREADY_GENERATED' };

  await db.subscriptionException.upsert({
    where: { subscriptionId_date: { subscriptionId, date } },
    create: {
      id: newId(ID_PREFIX.subscriptionException),
      subscriptionId,
      date,
      type: 'SKIP',
      reason: 'Skipped by the customer',
    },
    update: { type: 'SKIP', reason: 'Skipped by the customer' },
  });

  return { ok: true, dateKey };
}

/** Undoes a skip, while the cutoff still allows it. */
export async function unskipDay(
  subscriptionId: string,
  userId: string,
  dateKey: string,
  now: Date = new Date(),
): Promise<SkipResult> {
  const subscription = await ownedSubscription(subscriptionId, userId);
  if (!subscription) return { ok: false, reason: 'NOT_FOUND' };

  const cutoffHour = await getSettingNumber(SETTING_KEYS.skipCutoffHour);
  if (!canSkipDate(dateKey, now, cutoffHour)) return { ok: false, reason: 'TOO_LATE' };

  await db.subscriptionException.deleteMany({
    where: { subscriptionId, date: parseDateKey(dateKey), type: 'SKIP' },
  });

  return { ok: true, dateKey };
}

// ─────────────────────────────────────────────────────────────
// Pause a range / resume
// ─────────────────────────────────────────────────────────────

export type PauseResult =
  | { ok: true; days: number }
  | { ok: false; reason: 'NOT_FOUND' | 'INVALID_RANGE' | 'TOO_LATE' };

/**
 * A pause is a run of SKIP-shaped exceptions plus a status change, rather than
 * a separate concept. The generation job already refuses any date with an
 * exception, so pausing needs no new logic in the part that must not break.
 */
export async function pauseSubscription(
  subscriptionId: string,
  userId: string,
  fromDateKey: string,
  toDateKey_: string,
  now: Date = new Date(),
): Promise<PauseResult> {
  const subscription = await ownedSubscription(subscriptionId, userId);
  if (!subscription) return { ok: false, reason: 'NOT_FOUND' };
  if (toDateKey_ < fromDateKey) return { ok: false, reason: 'INVALID_RANGE' };

  const cutoffHour = await getSettingNumber(SETTING_KEYS.skipCutoffHour);
  if (!canSkipDate(fromDateKey, now, cutoffHour)) return { ok: false, reason: 'TOO_LATE' };

  const start = parseDateKey(fromDateKey);
  const end = parseDateKey(toDateKey_);
  const days = Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1;

  await db.$transaction(async (tx) => {
    for (let offset = 0; offset < days; offset++) {
      const date = addDays(start, offset);
      await tx.subscriptionException.upsert({
        where: { subscriptionId_date: { subscriptionId, date } },
        create: {
          id: newId(ID_PREFIX.subscriptionException),
          subscriptionId,
          date,
          type: 'PAUSE',
          reason: `Paused ${fromDateKey} to ${toDateKey_}`,
        },
        update: { type: 'PAUSE' },
      });
    }

    await tx.subscription.update({
      where: { id: subscriptionId },
      data: { status: 'PAUSED' },
    });
  });

  return { ok: true, days };
}

export async function resumeSubscription(
  subscriptionId: string,
  userId: string,
  now: Date = new Date(),
): Promise<{ ok: boolean; reason?: 'NOT_FOUND' }> {
  const subscription = await ownedSubscription(subscriptionId, userId);
  if (!subscription) return { ok: false, reason: 'NOT_FOUND' };

  const todayKey = istDateKeyOf(now);

  await db.$transaction(async (tx) => {
    // Only future pause days are lifted. A pause that already passed is
    // history, and removing it would make My Week lie about last Tuesday.
    await tx.subscriptionException.deleteMany({
      where: {
        subscriptionId,
        type: 'PAUSE',
        date: { gte: parseDateKey(todayKey) },
      },
    });

    await tx.subscription.update({
      where: { id: subscriptionId },
      data: { status: 'ACTIVE' },
    });
  });

  return { ok: true };
}

// ─────────────────────────────────────────────────────────────
// Cancel
// ─────────────────────────────────────────────────────────────

export type CancelSubscriptionResult =
  | { ok: true; refundedPaise: bigint; remainingDays: number }
  | { ok: false; reason: 'NOT_FOUND' | 'ALREADY_CANCELLED' };

/**
 * M6 — "cancel with prorated wallet refund". B3 — "On cancellation, refund
 * unused balance to the wallet. Never forfeit it."
 *
 * The prepaid float was never taken OUT of the wallet (D-119), so it is
 * already the customer's — there is nothing to give back. The only thing
 * actually charged was the plan fee, so that is what is prorated: the unused
 * days of the period, refunded as a credit.
 *
 * Idempotent on the subscription id, so a double-tapped cancel refunds once.
 */
export async function cancelSubscription(
  subscriptionId: string,
  userId: string,
  now: Date = new Date(),
): Promise<CancelSubscriptionResult> {
  const subscription = await ownedSubscription(subscriptionId, userId);
  if (!subscription) return { ok: false, reason: 'NOT_FOUND' };
  if (subscription.status === 'CANCELLED') return { ok: false, reason: 'ALREADY_CANCELLED' };

  const startKey = toDateKey(subscription.startDate);
  const endKey = toDateKey(subscription.endDate);

  const remaining = remainingDays(endKey, now);
  const total = totalDays(startKey, endKey);

  const refundPaise =
    total > 0 && remaining > 0
      ? (subscription.planFeePaise * BigInt(remaining)) / BigInt(total)
      : 0n;

  await db.$transaction(async (tx) => {
    await tx.subscription.update({
      where: { id: subscriptionId },
      data: { status: 'CANCELLED', cancelledAt: new Date() },
    });

    if (refundPaise > 0n) {
      await credit(
        {
          userId,
          amountPaise: refundPaise,
          source: 'CANCELLATION',
          ...LEDGER_REF.planFee(subscriptionId),
          note: `Plan fee refund for ${remaining} unused days`,
        },
        tx,
      );
    }
  });

  await notifyEvent(userId, TEMPLATE.subscriptionCancelled, {
    subscriptionId,
    refundedPaise: refundPaise,
    remainingDays: remaining,
  });

  return { ok: true, refundedPaise: refundPaise, remainingDays: remaining };
}

// ─────────────────────────────────────────────────────────────
// Change slot or address for future deliveries
// ─────────────────────────────────────────────────────────────

export type UpdateSubscriptionResult =
  | { ok: true }
  | { ok: false; reason: 'NOT_FOUND' | 'ADDRESS_NOT_FOUND' };

export async function updateSubscription(
  subscriptionId: string,
  userId: string,
  changes: { addressId?: string; deliverySlot?: DeliverySlot },
): Promise<UpdateSubscriptionResult> {
  const subscription = await ownedSubscription(subscriptionId, userId);
  if (!subscription) return { ok: false, reason: 'NOT_FOUND' };

  if (changes.addressId) {
    const address = await db.address.findUnique({
      where: { id: changes.addressId },
      select: { userId: true },
    });
    if (!address || address.userId !== userId) {
      return { ok: false, reason: 'ADDRESS_NOT_FOUND' };
    }
  }

  // Only future deliveries move. Orders already generated carry an address
  // SNAPSHOT (D-61), so today's delivery still goes where it was promised.
  await db.subscription.update({
    where: { id: subscriptionId },
    data: {
      ...(changes.addressId ? { addressId: changes.addressId } : {}),
      ...(changes.deliverySlot ? { deliverySlot: changes.deliverySlot } : {}),
    },
  });

  return { ok: true };
}
