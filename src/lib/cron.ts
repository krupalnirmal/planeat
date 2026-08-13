import { ApiError } from '@/lib/api/handler';
import { env } from '@/lib/env';

/**
 * PART 9 — cron routes are authenticated with `Bearer CRON_SECRET`.
 *
 * These endpoints move money and generate orders. Anything that can call them
 * can replay the daily-order job or the reconciliation job at will, so they are
 * as sensitive as any admin route — they simply have no user to authenticate.
 */

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function assertCronRequest(request: Request): void {
  const header = request.headers.get('authorization') ?? '';
  const presented = header.startsWith('Bearer ') ? header.slice(7).trim() : '';

  if (!presented || !safeEqual(presented, env.cron.secret)) {
    throw ApiError.unauthorized('Invalid cron secret');
  }
}

/**
 * IST is UTC+5:30 and the whole business runs on it — the 00:30 generation
 * window, the 20:00 preview, the 06:30–09:00 delivery slot. Storing UTC and
 * converting at the edges is the only way those stay right across a deploy in
 * any region.
 */
export function istNow(now: Date = new Date()): Date {
  return new Date(now.getTime() + 5.5 * 3_600_000);
}

/** The IST calendar date, as `YYYY-MM-DD`. */
export function istDateKey(now: Date = new Date()): string {
  return istNow(now).toISOString().slice(0, 10);
}
