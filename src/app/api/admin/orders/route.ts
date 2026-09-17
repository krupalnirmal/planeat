import { NextResponse } from 'next/server';
import { parseQuery, route } from '@/lib/api/handler';
import { ok } from '@/lib/api/response';
import { requirePermission } from '@/lib/admin/guard';
import { listAdminOrders, ordersToCsv } from '@/lib/admin/orders';
import { paginate } from '@/lib/validators/common';
import { ordersQuerySchema } from '@/lib/validators/admin';

export const dynamic = 'force-dynamic';

/** GET /api/admin/orders — filters over every order (M9); `format=csv`
    exports them instead (the dashboard's "Export" button, session
    2026-09-17), scoped by `dateFrom`/`dateTo` rather than pagination. */
export const GET = route(async (request: Request) => {
  await requirePermission('orders');
  const query = parseQuery(request, ordersQuerySchema);

  const filter = {
    status: query.status,
    type: query.type,
    dateKey: query.date,
    query: query.query,
    unassignedOnly: query.unassignedOnly,
    dateFrom: query.dateFrom ? new Date(`${query.dateFrom}T00:00:00.000Z`) : undefined,
    dateTo: query.dateTo ? new Date(`${query.dateTo}T23:59:59.999Z`) : undefined,
  };

  if (query.format === 'csv') {
    const { orders } = await listAdminOrders(filter, { skip: 0, take: 5000 });
    return new NextResponse(ordersToCsv(orders), {
      status: 200,
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="orders-${query.dateFrom ?? 'all'}-to-${query.dateTo ?? 'now'}.csv"`,
      },
    });
  }

  const { orders, total } = await listAdminOrders(filter, paginate(query));

  return ok({
    orders,
    page: query.page,
    perPage: query.perPage,
    total,
    hasMore: query.page * query.perPage < total,
  });
});
