import { db } from '@/lib/db';
import { getPushProvider } from '@/lib/services/push';
import { getWhatsAppProvider } from '@/lib/services/sms';
import type { Locale } from '@/generated/prisma/enums';
import { renderNotification } from './render';
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

export async function sendQueuedNotifications(): Promise<SendResult> {
  const queued = await db.notification.findMany({
    where: { status: 'QUEUED' },
    orderBy: { createdAt: 'asc' },
    take: BATCH_SIZE,
    select: {
      id: true,
      userId: true,
      channel: true,
      templateKey: true,
      payload: true,
      user: { select: { phone: true, preferredLanguage: true } },
    },
  });

  const result: SendResult = { sent: 0, failed: 0, errors: [] };

  for (const row of queued) {
    try {
      const locale = row.user.preferredLanguage as Locale;
      const payload = (row.payload ?? {}) as Record<string, unknown>;
      const rendered = renderNotification(row.templateKey as TemplateKey, locale, payload);

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
          continue;
        }

        const outcome = await getPushProvider().send(
          tokens.map((token) => ({ token })),
          { title: rendered.title, body: rendered.body },
        );
        if (outcome.invalidTokens.length > 0) await removeInvalidTokens(outcome.invalidTokens);
        if (outcome.accepted === 0) throw new Error('Push rejected by every registered device');
      } else {
        // IN_APP and SMS never reach this query (see the module comment).
        continue;
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

  return result;
}
