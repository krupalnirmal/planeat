import { parseQuery, route } from '@/lib/api/handler';
import { ok } from '@/lib/api/response';
import { requireStoreAdmin } from '@/lib/admin/guard';
import { listSwapRequests } from '@/lib/admin/meal-plans';
import { paginate, paginationSchema } from '@/lib/validators/common';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/swap-requests — B6's log view.
 *
 *   "Every swap is logged and visible in admin — visibility without a gate."
 *
 * Read-only on purpose. There is no approve or reject endpoint anywhere,
 * because `FEATURE_ADMIN_SWAP_APPROVAL` is false and rebuilding the approval
 * wait would automate the paperwork and keep the bottleneck.
 */
export const GET = route(async (request: Request) => {
  await requireStoreAdmin();
  const query = parseQuery(request, paginationSchema);

  const { swaps, total } = await listSwapRequests(paginate(query));

  return ok({
    swaps,
    page: query.page,
    perPage: query.perPage,
    total,
    hasMore: query.page * query.perPage < total,
  });
});
