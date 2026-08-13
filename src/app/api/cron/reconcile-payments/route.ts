import { route } from '@/lib/api/handler';
import { ok } from '@/lib/api/response';
import { assertCronRequest } from '@/lib/cron';
import { reconcilePendingPayments } from '@/lib/wallet/reconcile';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * POST /api/cron/reconcile-payments — P2's safety net.
 *
 * Runs every 15 minutes (see `vercel.json`). Anything PENDING for longer than
 * `PAYMENT_PENDING_RECONCILE_MINUTES` is re-queried against the gateway and
 * resolved.
 *
 * Webhooks get lost — a deploy restarts the process mid-request, a tunnel
 * drops, the retry budget runs out. Without this job a customer who genuinely
 * paid sits with no balance and no explanation.
 *
 * Idempotent: the ledger entry is keyed on the gateway payment id, so a
 * payment resolved here and then again by a late webhook credits exactly once.
 */
export const POST = route(async (request: Request) => {
  assertCronRequest(request);
  const result = await reconcilePendingPayments();
  return ok(result);
});

/** Vercel Cron issues GET. Same work, same guard. */
export const GET = POST;
