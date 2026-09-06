import { notifyAdmins, notifyEvent, type TemplateKey } from './notify';
import { sendNotificationsNow } from './send';

/**
 * Record + deliver, in one step, for the events somebody is actually
 * waiting on.
 *
 * `notifyEvent`/`notifyAdmins` only WRITE rows; the PUSH ones sit QUEUED
 * until `/api/cron/send-notifications` picks them up — and that cron is
 * scheduled once a day (`vercel.json`, `0 22 * * *`), so "a new order came
 * in" or "an order was assigned to you" would buzz a phone at ~03:30 IST.
 * These wrappers dispatch immediately instead, leaving the cron as the
 * backstop for everything that isn't time-critical.
 *
 * Sits above both modules rather than having `notify.ts` reach into
 * `send.ts` — send.ts already imports from notify.ts and render.ts, and
 * render.ts imports from notify.ts, so the reverse edge would close a
 * runtime import cycle.
 *
 * Never throws: delivery is best-effort, and the order or assignment that
 * triggered it has already committed.
 */

async function dispatchQuietly(ids: string[]): Promise<void> {
  try {
    await sendNotificationsNow(ids);
  } catch (error) {
    console.error('[notify-now] immediate dispatch failed', error);
  }
}

export async function notifyEventNow(
  userId: string,
  templateKey: TemplateKey,
  payload: Record<string, unknown>,
): Promise<void> {
  const rows = await notifyEvent(userId, templateKey, payload);
  await dispatchQuietly(rows.filter((row) => row.channel === 'PUSH').map((row) => row.id));
}

export async function notifyAdminsNow(
  templateKey: TemplateKey,
  payload: Record<string, unknown>,
): Promise<void> {
  const rows = await notifyAdmins(templateKey, payload);
  await dispatchQuietly(rows.filter((row) => row.channel === 'PUSH').map((row) => row.id));
}
