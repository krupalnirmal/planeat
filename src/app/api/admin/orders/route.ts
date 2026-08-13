import { parseQuery, route } from '@/lib/api/handler';
import { ok } from '@/lib/api/response';
import { requireStoreAdmin } from '@/lib/admin/guard';
import { listAdminOrders } from '@/lib/admin/orders';
import { paginate } from '@/lib/validators/common';
import { ordersQuerySchema } from '@/lib/validators/admin';

export const dynamic = 'force-dynamic';

/** GET /api/admin/orders — filters over every order (M9). */
export const GET = route(async (request: Request) => {
  await requireStoreAdmin();
  const query = parseQuery(request, ordersQuerySchema);

  const { orders, total } = await listAdminOrders(
    {
      status: query.status,
      type: query.type,
      dateKey: query.date,
      query: query.query,
      unassignedOnly: query.unassignedOnly,
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
