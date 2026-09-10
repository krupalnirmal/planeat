import { ApiError, route } from '@/lib/api/handler';
import { ok } from '@/lib/api/response';
import { requireUser } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { getOrderPaymentStatus } from '@/lib/orders/pay';
import { reconcileOnePayment } from '@/lib/wallet/reconcile';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

/** Long enough that a normal webhook has almost always already landed —
    matches `/api/wallet/topup/status`'s own threshold, same reasoning. */
const INLINE_RECONCILE_AFTER_MS = 20_000;

/**
 * GET /api/orders/:id/pay/status
 *
 * What the checkout screen polls after the gateway's callback fires.
 *
 * Session 2026-09-10: same fix as the wallet top-up status route — once the
 * order's payment has been PENDING long enough that a webhook should have
 * landed, this tries `reconcileOnePayment` itself first rather than leaving
 * a lost webhook to the once-a-day batch job. Still safe to call
 * repeatedly (or not at all, if a webhook wins the race): the order is
 * marked paid only once, guarded on it still being PENDING.
 */
export const GET = route(async (_request: Request, context: Context) => {
  const session = await requireUser();
  const { id } = await context.params;

  const order = await db.order.findUnique({ where: { id }, select: { userId: true, paymentStatus: true } });
  if (!order || order.userId !== session.userId) throw ApiError.notFound('Order not found');

  if (order.paymentStatus === 'PENDING') {
    const payment = await db.payment.findFirst({
      where: { orderId: id, status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
      select: { id: true, createdAt: true },
    });
    if (payment && Date.now() - payment.createdAt.getTime() > INLINE_RECONCILE_AFTER_MS) {
      await reconcileOnePayment(payment.id).catch(() => {
        // The gateway call failing must not fail the poll itself.
      });
    }
  }

  const status = await getOrderPaymentStatus(id, session.userId);
  if (!status) throw ApiError.notFound('Order not found');

  return ok(status);
});
