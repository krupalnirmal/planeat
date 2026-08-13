import { route } from '@/lib/api/handler';
import { ok } from '@/lib/api/response';
import { assertCronRequest } from '@/lib/cron';
import { generateDailyOrders } from '@/lib/subscription/generate-orders';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * POST /api/cron/generate-daily-orders — the 00:30 IST job (M6).
 *
 * `vercel.json` schedules it at 19:00 UTC, which is 00:30 IST the next day.
 *
 * This is the job the whole business rests on: it is what turns an approved
 * plan into vegetables at somebody's door six hours later. A silent failure
 * means nobody gets a delivery and the owner finds out from phone calls at
 * 07:00 — which is exactly why the response carries a full breakdown and why
 * `/api/admin/cron-health` exists to alert on a zero.
 *
 * R5 — running it twice for the same date is harmless.
 */
export const POST = route(async (request: Request) => {
  assertCronRequest(request);

  const result = await generateDailyOrders();

  if (result.failures.length > 0) {
    console.error('[cron] daily order generation had failures', result.failures);
  }

  return ok(result);
});

/** Vercel Cron issues GET. Same work, same guard. */
export const GET = POST;
