import { route } from '@/lib/api/handler';
import { ok } from '@/lib/api/response';
import { assertCronRequest } from '@/lib/cron';
import { sendQueuedNotifications } from '@/lib/notifications/send';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * POST /api/cron/send-notifications — the dispatch half of M8, every few
 * minutes. See `src/lib/notifications/send.ts` for why this is a batch job
 * rather than sending inline with the event that queued it.
 */
export const POST = route(async (request: Request) => {
  assertCronRequest(request);
  const result = await sendQueuedNotifications();
  return ok(result);
});

export const GET = POST;
