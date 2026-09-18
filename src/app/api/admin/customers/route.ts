import { parseQuery, route } from '@/lib/api/handler';
import { ok } from '@/lib/api/response';
import { requirePermission } from '@/lib/admin/guard';
import { searchCustomers } from '@/lib/admin/customers';
import { paginate } from '@/lib/validators/common';
import { customersQuerySchema } from '@/lib/validators/admin';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/customers — search by name or phone (M9), optionally
 * scoped to a `createdAt` range (dashboard v2's Customers tab, Part L).
 *
 * S6 — the result says whether a health profile EXISTS, never what is in it.
 * Reading one is a separate, logged, Super-Admin-only call.
 */
export const GET = route(async (request: Request) => {
  await requirePermission('customers');
  const query = parseQuery(request, customersQuerySchema);

  const { customers, total } = await searchCustomers(
    {
      query: query.query,
      dateFrom: query.dateFrom ? new Date(`${query.dateFrom}T00:00:00.000Z`) : undefined,
      dateTo: query.dateTo ? new Date(`${query.dateTo}T23:59:59.999Z`) : undefined,
    },
    paginate(query),
  );

  return ok({
    customers,
    page: query.page,
    perPage: query.perPage,
    total,
    hasMore: query.page * query.perPage < total,
  });
});
