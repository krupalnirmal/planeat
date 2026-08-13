import { clientIp, parseJson, parseQuery, route } from '@/lib/api/handler';
import { ok } from '@/lib/api/response';
import { requireStoreAdmin } from '@/lib/admin/guard';
import { bulkUpdateStock, listInventory } from '@/lib/admin/inventory';
import { paginate } from '@/lib/validators/common';
import { bulkStockSchema, inventoryQuerySchema } from '@/lib/validators/admin';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** GET /api/admin/inventory — stock levels, low and out-of-stock views. */
export const GET = route(async (request: Request) => {
  await requireStoreAdmin();
  const query = parseQuery(request, inventoryQuerySchema);

  const { rows, total } = await listInventory(
    {
      query: query.query,
      categorySlug: query.categorySlug,
      onlyLow: query.onlyLow,
      onlyOut: query.onlyOut,
    },
    query.locale,
    paginate(query),
  );

  return ok({
    rows,
    page: query.page,
    perPage: query.perPage,
    total,
    hasMore: query.page * query.perPage < total,
  });
});

/**
 * PATCH /api/admin/inventory — bulk update (M9).
 *
 * One transaction for the whole batch, and one audit row per variant. A single
 * "12 variants changed" entry is useless when the question is which one got
 * the wrong price.
 */
export const PATCH = route(async (request: Request) => {
  const session = await requireStoreAdmin();
  const { updates } = await parseJson(request, bulkStockSchema);

  const result = await bulkUpdateStock(
    updates.map((update) => ({
      variantId: update.variantId,
      stockQty: update.stockQty,
      lowStockThreshold: update.lowStockThreshold,
      pricePaise: update.pricePaise !== undefined ? BigInt(update.pricePaise) : undefined,
      isActive: update.isActive,
    })),
    session.userId,
    clientIp(request),
  );

  return ok(result);
});
