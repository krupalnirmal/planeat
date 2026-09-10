import { ApiError, parseQuery, route } from '@/lib/api/handler';
import { ok } from '@/lib/api/response';
import { requireUser } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { reconcileOnePayment } from '@/lib/wallet/reconcile';
import { getTopupStatus } from '@/lib/wallet/queries';
import { topupStatusQuerySchema } from '@/lib/validators/wallet';

export const dynamic = 'force-dynamic';

/** Long enough that a normal webhook has almost always already landed —
    calling the gateway on every 2-second poll would be wasteful and would
    make a slow-but-legitimate webhook race this inline check for nothing. */
const INLINE_RECONCILE_AFTER_MS = 20_000;

/**
 * GET /api/wallet/topup/status?paymentId=
 *
 * What the browser polls after the gateway's callback fires.
 *
 * Session 2026-09-10: this used to be a pure read ("polling this never
 * credits anything"), which sounded safe but meant a lost webhook left the
 * customer's own poll loop waiting for a batch job that — on this
 * platform's cron limits — only runs once a day. Now, once a payment has
 * been PENDING long enough that a webhook should have already arrived, this
 * route tries `reconcileOnePayment` itself before answering — the same
 * gateway lookup the daily job does, just for this one payment, right when
 * someone is actually watching. Still safe to call repeatedly: the ledger
 * entry is keyed on the gateway payment id, so this can never double-credit
 * even racing a webhook that lands a second later.
 */
export const GET = route(async (request: Request) => {
  const session = await requireUser();
  const { paymentId } = parseQuery(request, topupStatusQuerySchema);

  const payment = await db.payment.findUnique({
    where: { id: paymentId },
    select: { userId: true, status: true, createdAt: true },
  });
  if (!payment || payment.userId !== session.userId) throw ApiError.notFound('Payment not found');

  if (payment.status === 'PENDING' && Date.now() - payment.createdAt.getTime() > INLINE_RECONCILE_AFTER_MS) {
    await reconcileOnePayment(paymentId).catch(() => {
      // The gateway call failing must not fail the poll itself — the
      // customer just sees "still pending" and the next poll tries again.
    });
  }

  const status = await getTopupStatus(paymentId, session.userId);
  if (!status) throw ApiError.notFound('Payment not found');

  return ok(status);
});
