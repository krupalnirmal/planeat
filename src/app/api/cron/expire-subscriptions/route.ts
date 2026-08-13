import { route } from '@/lib/api/handler';
import { ok } from '@/lib/api/response';
import { assertCronRequest } from '@/lib/cron';
import { expireSubscriptions } from '@/lib/subscription/daily-jobs';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * POST /api/cron/expire-subscriptions (M6).
 *
 * Closes finished periods and sends the T-2 renewal reminder. Two days is
 * enough for the customer to renew before the gap, and short enough that they
 * still remember agreeing to it.
 */
export const POST = route(async (request: Request) => {
  assertCronRequest(request);
  const result = await expireSubscriptions();
  return ok(result);
});

export const GET = POST;
