import { parseQuery, route } from '@/lib/api/handler';
import { ok } from '@/lib/api/response';
import { requirePermission } from '@/lib/admin/guard';
import { listSubscriptions } from '@/lib/admin/subscriptions';
import { paginate } from '@/lib/validators/common';
import { subscriptionsQuerySchema } from '@/lib/validators/admin';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/subscriptions — the "My Meal Plan" admin module's list:
 * every customer's subscription in one place (session 2026-09-18), where
 * previously this data only existed one customer at a time on the customer
 * detail page. Gated on the `customers` permission section — a
 * subscription is customer data, not a separate section of its own.
 */
export const GET = route(async (request: Request) => {
  await requirePermission('customers');
  const query = parseQuery(request, subscriptionsQuerySchema);

  const { subscriptions, total } = await listSubscriptions(
    {
      status: query.status,
      query: query.query,
      dateFrom: query.dateFrom ? new Date(`${query.dateFrom}T00:00:00.000Z`) : undefined,
      dateTo: query.dateTo ? new Date(`${query.dateTo}T23:59:59.999Z`) : undefined,
    },
    paginate(query),
  );

  return ok({
    subscriptions,
    page: query.page,
    perPage: query.perPage,
    total,
    hasMore: query.page * query.perPage < total,
  });
});
