import { db } from '@/lib/db';
import { ID_PREFIX, newId } from '@/lib/ids';
import type { NotificationChannel } from '@/generated/prisma/enums';

/**
 * M8 — record + fan out.
 *
 * Phase 6 built the durable half: a notification is RECORDED here as a row,
 * which is what makes "an out-of-stock item auto-substitutes and notifies,
 * never silently vanishes" true even before any channel exists. Phase 9 adds
 * the rest — sending to the channels B16 and the M8 table actually specify,
 * and the sender in `send.ts` that does the dispatching.
 *
 * Recording never throws. A failed notification must not roll back the order
 * or subscription action it was describing.
 */

export const TEMPLATE = {
  orderSubstituted: 'order.substituted',
  orderItemDropped: 'order.item_dropped',
  orderPaymentPending: 'order.payment_pending',
  orderSkippedUnpaid: 'order.skipped_unpaid',
  orderStatusChanged: 'order.status_changed',
  lowWalletBalance: 'wallet.low_balance',
  tomorrowPreview: 'subscription.tomorrow_preview',
  subscriptionExpiring: 'subscription.expiring',
  subscriptionCancelled: 'subscription.cancelled',
  mealPlanReady: 'meal_plan.ready',
} as const;

export type TemplateKey = (typeof TEMPLATE)[keyof typeof TEMPLATE];

/**
 * PART 7's M8 table, one row per template. IN_APP is not listed per-event in
 * that table because it is the constant underneath all of them — the durable
 * record every event gets regardless of which other channel also fires.
 *
 * WhatsApp is B16's primary channel; SMS is deliberately absent everywhere
 * here because B16 restricts SMS to OTP alone (`src/lib/auth/otp.ts`).
 */
export const CHANNELS_BY_TEMPLATE: Record<TemplateKey, readonly NotificationChannel[]> = {
  [TEMPLATE.orderStatusChanged]: ['IN_APP', 'PUSH'],
  [TEMPLATE.orderSubstituted]: ['IN_APP', 'PUSH'],
  [TEMPLATE.orderItemDropped]: ['IN_APP', 'PUSH'],
  [TEMPLATE.orderPaymentPending]: ['IN_APP', 'PUSH'],
  [TEMPLATE.orderSkippedUnpaid]: ['IN_APP', 'PUSH'],
  [TEMPLATE.mealPlanReady]: ['IN_APP', 'PUSH'],
  [TEMPLATE.lowWalletBalance]: ['IN_APP', 'PUSH', 'WHATSAPP'],
  [TEMPLATE.tomorrowPreview]: ['IN_APP', 'WHATSAPP', 'PUSH'],
  [TEMPLATE.subscriptionExpiring]: ['IN_APP', 'WHATSAPP'],
  [TEMPLATE.subscriptionCancelled]: ['IN_APP'],
};

export interface NotifyInput {
  userId: string;
  templateKey: TemplateKey;
  /** Everything the render step will need. Never a rendered string (R7). */
  payload: Record<string, unknown>;
  channel?: NotificationChannel;
}

/**
 * The single-row primitive. `notifyEvent` below is what call sites should
 * reach for; this stays exported because a handful of channels (the IN_APP
 * durable record specifically) are still written one at a time.
 *
 * An IN_APP row has nothing further to send — the row itself is the delivery
 * — so it is written already `SENT`. Every other channel starts `QUEUED` for
 * `send.ts` to pick up.
 */
export async function notify(input: NotifyInput): Promise<void> {
  const channel = input.channel ?? 'IN_APP';
  try {
    await db.notification.create({
      data: {
        id: newId(ID_PREFIX.notification),
        userId: input.userId,
        channel,
        templateKey: input.templateKey,
        payload: serialiseBigInts(input.payload) as never,
        status: channel === 'IN_APP' ? 'SENT' : 'QUEUED',
        sentAt: channel === 'IN_APP' ? new Date() : null,
      },
    });
  } catch (error) {
    console.error('[notify] could not record notification', input.templateKey, error);
  }
}

/**
 * Fans one event out to every channel the M8 table lists for it — one row per
 * channel, because `notifications.channel` is singular and a statement or a
 * per-channel sender both need to tell "the WhatsApp attempt" apart from "the
 * push attempt" for the same event.
 */
export async function notifyEvent(
  userId: string,
  templateKey: TemplateKey,
  payload: Record<string, unknown>,
): Promise<void> {
  const channels = CHANNELS_BY_TEMPLATE[templateKey];
  await Promise.all(channels.map((channel) => notify({ userId, templateKey, payload, channel })));
}

/** BigInt does not survive the Json column (R4). */
function serialiseBigInts(value: unknown): unknown {
  if (typeof value === 'bigint') return value.toString();
  if (Array.isArray(value)) return value.map(serialiseBigInts);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, serialiseBigInts(entry)]),
    );
  }
  return value;
}
