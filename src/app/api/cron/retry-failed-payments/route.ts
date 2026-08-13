import { route } from '@/lib/api/handler';
import { ok } from '@/lib/api/response';
import { assertCronRequest } from '@/lib/cron';
import { retryPendingPayments } from '@/lib/subscription/daily-jobs';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * POST /api/cron/retry-failed-payments — the 08:00 IST job (B3).
 *
 * Orders held as PAYMENT_PENDING at 00:30 get one more attempt. Still short →
 * that day is marked SKIPPED_UNPAID, the stock goes back, and **the
 * subscription continues**. One short morning must not cancel a month the
 * customer has already committed to.
 */
export const POST = route(async (request: Request) => {
  assertCronRequest(request);

  const result = await retryPendingPayments();

  if (result.failures.length > 0) {
    console.error('[cron] payment retry had failures', result.failures);
  }

  return ok(result);
});

export const GET = POST;
