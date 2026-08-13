import { route } from '@/lib/api/handler';
import { ok } from '@/lib/api/response';
import { assertCronRequest } from '@/lib/cron';
import { sendTomorrowPreview } from '@/lib/subscription/daily-jobs';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * POST /api/cron/send-tomorrow-preview — the 20:00 IST job (M8, B3).
 *
 * Two things in one pass, because both need the same computation:
 *   - tomorrow's delivery preview with the exact bill (M8)
 *   - a top-up warning to anyone whose balance will not cover it (B3)
 *
 * 20:00 is also the skip cutoff, so this notification is the last moment the
 * customer can act on tomorrow — which is precisely why it carries the real
 * number rather than an estimate.
 */
export const POST = route(async (request: Request) => {
  assertCronRequest(request);
  const result = await sendTomorrowPreview();
  return ok(result);
});

export const GET = POST;
