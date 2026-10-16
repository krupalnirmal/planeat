import { ApiError, clientIp, route } from '@/lib/api/handler';
import { ok } from '@/lib/api/response';
import { changeOrderStatus } from '@/lib/admin/orders';
import { requireVendor } from '@/lib/vendor/guard';
import { vendorOwnsOrder } from '@/lib/vendor/orders';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

/**
 * POST /api/vendor/orders/:id/pack — the vendor's one action on an order.
 * Reuses `changeOrderStatus` (src/lib/admin/orders.ts) directly: packing is
 * an operational checkpoint, not a money/stock event, so it needs no admin
 * confirmation — same reasoning as a rider's pickup scan
 * (src/lib/delivery/status.ts's `advanceAssignment`). The only thing this
 * route adds is the ownership gate.
 */
export const POST = route(async (request: Request, context: Context) => {
  const session = await requireVendor();
  const { id } = await context.params;
  const ip = clientIp(request);

  if (!(await vendorOwnsOrder(session.vendorId, id))) throw ApiError.notFound('Order not found');

  const result = await changeOrderStatus(id, 'PACKED', session.claims.userId, 'Packed by vendor', ip);

  if (!result.ok) {
    if (result.reason === 'NOT_FOUND') throw ApiError.notFound('Order not found');
    if (result.reason === 'CONFLICT') {
      throw ApiError.conflict('Someone else already changed this order — refresh and try again', {
        from: result.from,
      });
    }
    throw ApiError.conflict(`Cannot pack an order in ${result.from} status`, { from: result.from });
  }

  return ok({ status: result.to });
});
