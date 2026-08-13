import { ApiError, parseJson, route } from '@/lib/api/handler';
import { ok } from '@/lib/api/response';
import { requireUser } from '@/lib/auth/session';
import { cancelOrder } from '@/lib/orders/cancel';
import { db } from '@/lib/db';
import { cancelOrderSchema } from '@/lib/validators/order';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

/**
 * POST /api/orders/:id/cancel
 *
 * PART 12 — "Cancelling a PLACED order refunds the wallet exactly once."
 * The refund is idempotent on the ledger, and the status guard means a second
 * call is refused before it gets that far.
 */
export const POST = route(async (request: Request, context: Context) => {
  const session = await requireUser();
  const { id } = await context.params;
  const { reason } = await parseJson(request, cancelOrderSchema);

  // R9 — ownership before anything else. Cancelling by guessing an id is not
  // something a status check would catch.
  const owned = await db.order.findUnique({ where: { id }, select: { userId: true } });
  if (!owned || owned.userId !== session.userId) throw ApiError.notFound('Order not found');

  const result = await cancelOrder({ orderId: id, actorId: session.userId, reason });

  if (!result.ok) {
    if (result.reason === 'NOT_FOUND') throw ApiError.notFound('Order not found');
    throw ApiError.conflict('This order can no longer be cancelled', { status: result.status });
  }

  return ok({
    cancelled: true,
    refundedPaise: result.refundedPaise,
    alreadyRefunded: result.alreadyRefunded,
  });
});
