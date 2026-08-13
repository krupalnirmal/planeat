import { parseQuery, route } from '@/lib/api/handler';
import { ok } from '@/lib/api/response';
import { requireStoreAdmin } from '@/lib/admin/guard';
import { listMealPlans } from '@/lib/admin/meal-plans';
import { paginate } from '@/lib/validators/common';
import { mealPlansQuerySchema } from '@/lib/validators/admin';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/meal-plans — all plans, and B8's flagged review queue.
 *
 * `?unreviewedOnly=true` is the queue the dashboard counts. Unreviewed flagged
 * plans sort first regardless, because they are why this screen exists.
 */
export const GET = route(async (request: Request) => {
  await requireStoreAdmin();
  const query = parseQuery(request, mealPlansQuerySchema);

  const { plans, total } = await listMealPlans(
    {
      flaggedOnly: query.flaggedOnly,
      unreviewedOnly: query.unreviewedOnly,
      query: query.query,
    },
    paginate(query),
  );

  return ok({
    plans,
    page: query.page,
    perPage: query.perPage,
    total,
    hasMore: query.page * query.perPage < total,
  });
});
