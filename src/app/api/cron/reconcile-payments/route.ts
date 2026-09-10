import { route } from '@/lib/api/handler';
import { ok } from '@/lib/api/response';
import { assertCronRequest } from '@/lib/cron';
import { reconcilePendingPayments } from '@/lib/wallet/reconcile';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * POST /api/cron/reconcile-payments — P2's daily backstop.
 *
 * Runs once a day (`vercel.json` — every cron in this project does; that's
 * the platform's own limit, not a choice made for this job specifically).
 * Anything still PENDING for longer than `PAYMENT_PENDING_RECONCILE_MINUTES`
 * is re-queried against the gateway and resolved.
 *
 * This is the backstop under `reconcileOnePayment` (`src/lib/wallet/
 * reconcile.ts`), which the status-polling routes now call inline — that is
 * what actually catches a lost webhook within seconds for someone watching
 * the "waiting for your bank" screen. This job exists for the payment
 * nobody ever polled for again (closed the tab, lost signal) once a day is
 * still far better than never.
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
