import { db } from '@/lib/db';
import { getPushProvider } from '@/lib/services/push';
import { getWhatsAppProvider } from '@/lib/services/sms';
import type { Locale } from '@/generated/prisma/enums';
import { renderNotification, urlFor } from './render';
import { removeInvalidTokens, tokensForUser } from './push-tokens';
import type { TemplateKey } from './notify';

/**
 * The dispatch half of M8 — reads what `notify()`/`notifyEvent()` queued and
 * actually sends it. Runs from `/api/cron/send-notifications` every few
 * minutes rather than inline with the event, for the same reason payment
 * reconciliation is a separate job (D-75): one unreachable phone number must
 * not stall the order or subscription action that queued the notification,
 * and a batch can retry what a single inline call could not.
 *
 * IN_APP rows are never queued (`notify()` marks them SENT immediately) — the
 * row itself is the delivery. Only WHATSAPP and PUSH reach this file; SMS is
 * never queued at all, because B16 restricts SMS to OTP, which bypasses this
 * system entirely (`src/lib/auth/otp.ts`).
 */

export interface SendResult {
  sent: number;
  failed: number;
  errors: Array<{ notificationId: string; message: string }>;
}

const BATCH_SIZE = 100;

const dispatchSelect = {
  id: true,
  userId: true,
  channel: true,
  templateKey: true,
  payload: true,
  user: { select: { phone: true, preferredLanguage: true } },
} as const;

type DispatchRow = {
  id: string;
  userId: string;
  channel: string;
  templateKey: string;
  payload: unknown;
  user: { phone: string; preferredLanguage: string };
};

/**
 * One row, sent and marked. Split out of the batch loop so a time-sensitive
 * notification can be pushed the moment it is queued (`notify-now.ts`)
 * rather than waiting for the cron — which, per `vercel.json`, runs once a
 * day, not "every few minutes".
 */
async function dispatchNotification(row: DispatchRow, result: SendResult): Promise<void> {
  try {
    const locale = row.user.preferredLanguage as Locale;
    const payload = (row.payload ?? {}) as Record<string, unknown>;
    const templateKey = row.templateKey as TemplateKey;
    const rendered = renderNotification(templateKey, locale, payload);

    if (row.channel === 'WHATSAPP') {
      const outcome = await getWhatsAppProvider().sendText({
        phone: row.user.phone,
        body: `${rendered.title}\n${rendered.body}`,
      });
      if (!outcome.accepted) throw new Error(outcome.error ?? 'WhatsApp rejected the message');
    } else if (row.channel === 'PUSH') {
      const tokens = await tokensForUser(row.userId);
      if (tokens.length === 0) {
        // Nobody registered a device for push yet — not an error, just
        // nothing to deliver to. IN_APP already carries the record.
        await db.notification.update({
          where: { id: row.id },
          data: { status: 'FAILED', error: 'No registered push token' },
        });
        return;
      }

      const outcome = await getPushProvider().send(
        tokens.map((token) => ({ token })),
        { title: rendered.title, body: rendered.body, url: urlFor(templateKey, locale, payload) },
      );
      if (outcome.invalidTokens.length > 0) await removeInvalidTokens(outcome.invalidTokens);
      if (outcome.accepted === 0) throw new Error('Push rejected by every registered device');
    } else {
      // IN_APP and SMS never reach here (see the module comment).
      return;
    }

    await db.notification.update({
      where: { id: row.id },
      data: { status: 'SENT', sentAt: new Date() },
    });
    result.sent += 1;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await db.notification.update({
      where: { id: row.id },
      data: { status: 'FAILED', error: message },
    });
    result.failed += 1;
    result.errors.push({ notificationId: row.id, message });
  }
}

export async function sendQueuedNotifications(): Promise<SendResult> {
  const queued = await db.notification.findMany({
    where: { status: 'QUEUED' },
    orderBy: { createdAt: 'asc' },
    take: BATCH_SIZE,
    select: dispatchSelect,
  });

  const result: SendResult = { sent: 0, failed: 0, errors: [] };
  for (const row of queued) {
    await dispatchNotification(row, result);
  }
  return result;
}

/**
 * Dispatch specific rows right now. Used by `notify-now.ts` for the events
 * a person is waiting on — a rider being handed an order, the shop being
 * told one came in — where the nightly cron would deliver the push around
 * 03:30 IST and be worse than useless.
 *
 * Anything that fails here is left as a FAILED row, which the cron's own
 * pass does not retry — the IN_APP row is still the durable record, and the
 * screens both audiences already watch (the rider's order list, the admin
 * bell) do not depend on push having landed.
 */
export async function sendNotificationsNow(notificationIds: string[]): Promise<SendResult> {
  const result: SendResult = { sent: 0, failed: 0, errors: [] };
  if (notificationIds.length === 0) return result;

  const rows = await db.notification.findMany({
    where: { id: { in: notificationIds }, status: 'QUEUED' },
    select: dispatchSelect,
  });

  for (const row of rows) {
    await dispatchNotification(row, result);
  }
  return result;
}
