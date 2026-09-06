import { ApiError, clientIp, parseJson, route } from '@/lib/api/handler';
import { ok } from '@/lib/api/response';
import { requireStoreAdmin } from '@/lib/admin/guard';
import { changeOrderStatus } from '@/lib/admin/orders';
import { cancelOrder } from '@/lib/orders/cancel';
import { changeStatusSchema } from '@/lib/validators/admin';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

/**
 * POST /api/admin/orders/:id/status (M9).
 *
 * A cancellation is routed to `cancelOrder` — the same function the customer's
 * own cancel uses, with `asAdmin: true`. There is deliberately no second
 * cancellation path: two of them would eventually disagree about whether the
 * wallet was credited and the stock returned.
 *
 * REFUNDED is refused outright (session 2026-09-06) rather than falling
 * through to `changeOrderStatus`, which only flips the status column — it has
 * no wallet-crediting logic at all. Before this guard, a bare
 * `{status: 'REFUNDED'}` call (DELIVERED/CANCELLED/FAILED_DELIVERY all allow
 * the transition) would mark an order refunded in the database while no
 * money ever moved, and nothing about the response would say so. A
 * post-delivery refund needs a real flow — the complaints/issue system,
 * which doesn't have an admin surface yet — not a name-only status flip.
 */
export const POST = route(async (request: Request, context: Context) => {
  const session = await requireStoreAdmin();
  const { id } = await context.params;
  const input = await parseJson(request, changeStatusSchema);
  const ip = clientIp(request);

  if (input.status === 'REFUNDED') {
    throw ApiError.badRequest(
      'Marking an order REFUNDED here would not actually credit the wallet — there is no refund flow behind this status yet. Use Cancel for a pre-delivery refund.',
    );
  }

  if (input.status === 'CANCELLED') {
    const result = await cancelOrder({
      orderId: id,
      actorId: session.userId,
      asAdmin: true,
      reason: input.reason ?? 'Cancelled by admin',
    });

    if (!result.ok) {
      if (result.reason === 'NOT_FOUND') throw ApiError.notFound('Order not found');
      throw ApiError.conflict('That order can no longer be cancelled', {
        status: result.status,
      });
    }

    return ok({
      status: 'CANCELLED',
      refundedPaise: result.refundedPaise,
      alreadyRefunded: result.alreadyRefunded,
    });
  }

  const result = await changeOrderStatus(
    id,
    input.status,
    session.userId,
    input.reason ?? null,
    ip,
  );

  if (!result.ok) {
    if (result.reason === 'NOT_FOUND') throw ApiError.notFound('Order not found');
    throw ApiError.conflict(`An order cannot go from ${result.from} to ${input.status}`, {
      from: result.from,
      to: input.status,
    });
  }

  return ok({ from: result.from, to: result.to });
});
