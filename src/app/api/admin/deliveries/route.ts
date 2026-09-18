import { parseQuery, route } from '@/lib/api/handler';
import { ok } from '@/lib/api/response';
import { requirePermission } from '@/lib/admin/guard';
import { listDeliveryOrders } from '@/lib/admin/orders';
import { paginate } from '@/lib/validators/common';
import { deliveriesQuerySchema } from '@/lib/validators/admin';

export const dynamic = 'force-dynamic';

/** GET /api/admin/deliveries — dashboard v2's Deliveries tab (session
    2026-09-19, Part P): orders with a real rider assignment, joined with
    `DeliveryAssignment`/`DeliveryPartner`. Gated on `orders`, the same
    permission section every other dashboard-v2 order re-slice uses. */
export const GET = route(async (request: Request) => {
  await requirePermission('orders');
  const query = parseQuery(request, deliveriesQuerySchema);

  const { orders, total } = await listDeliveryOrders(
    {
      query: query.query,
      assignmentStatus: query.assignmentStatus,
      dateFrom: query.dateFrom ? new Date(`${query.dateFrom}T00:00:00.000Z`) : undefined,
      dateTo: query.dateTo ? new Date(`${query.dateTo}T23:59:59.999Z`) : undefined,
    },
    paginate(query),
  );

  return ok({
    orders,
    page: query.page,
    perPage: query.perPage,
    total,
    hasMore: query.page * query.perPage < total,
  });
});
