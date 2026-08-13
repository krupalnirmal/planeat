import { parseQuery, route } from '@/lib/api/handler';
import { ok } from '@/lib/api/response';
import { requireStoreAdmin } from '@/lib/admin/guard';
import { searchCustomers } from '@/lib/admin/customers';
import { paginate } from '@/lib/validators/common';
import { adminListQuerySchema } from '@/lib/validators/admin';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/customers — search by name or phone (M9).
 *
 * S6 — the result says whether a health profile EXISTS, never what is in it.
 * Reading one is a separate, logged, Super-Admin-only call.
 */
export const GET = route(async (request: Request) => {
  await requireStoreAdmin();
  const query = parseQuery(request, adminListQuerySchema);

  const { customers, total } = await searchCustomers(query.query, paginate(query));

  return ok({
    customers,
    page: query.page,
    perPage: query.perPage,
    total,
    hasMore: query.page * query.perPage < total,
  });
});
