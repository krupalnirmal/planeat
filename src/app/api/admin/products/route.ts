import { z } from 'zod';
import { ApiError, clientIp, parseJson, parseQuery, route } from '@/lib/api/handler';
import { ok } from '@/lib/api/response';
import { requireStoreAdmin } from '@/lib/admin/guard';
import { createProduct, listProducts } from '@/lib/admin/catalogue';
import { paginate } from '@/lib/validators/common';
import { adminListQuerySchema, productSchema } from '@/lib/validators/admin';

export const dynamic = 'force-dynamic';

const listQuerySchema = adminListQuerySchema.extend({
  categorySlug: z.string().trim().max(120).optional(),
  includeInactive: z.coerce.boolean().optional(),
});

export const GET = route(async (request: Request) => {
  await requireStoreAdmin();
  const query = parseQuery(request, listQuerySchema);

  const { products, total } = await listProducts(
    {
      query: query.query,
      categorySlug: query.categorySlug,
      includeInactive: query.includeInactive,
    },
    query.locale,
    paginate(query),
  );

  return ok({
    products,
    page: query.page,
    perPage: query.perPage,
    total,
    hasMore: query.page * query.perPage < total,
  });
});

/**
 * POST /api/admin/products (M9).
 *
 * B13 is enforced in `createProduct`, not here: only Vegetables and Fruits may
 * be meal-plan eligible, whatever the form sends. A misconfigured ice cream in
 * somebody's weekly plan is not a mistake anybody would catch before it
 * reached them.
 */
export const POST = route(async (request: Request) => {
  const session = await requireStoreAdmin();
  const input = await parseJson(request, productSchema);

  const result = await createProduct(
    { ...input, description: input.description ?? null },
    session.userId,
    clientIp(request),
  );

  if (!result.ok) {
    if (result.reason === 'DUPLICATE_SKU') throw ApiError.conflict('That SKU already exists');
    throw ApiError.notFound('Category not found');
  }

  return ok({ productId: result.productId }, { status: 201 });
});
