import { z } from 'zod';
import { ApiError, parseQuery, route } from '@/lib/api/handler';
import { ok } from '@/lib/api/response';
import { getProductDetail } from '@/lib/catalog/queries';
import { localeSchema } from '@/lib/validators/common';

// Dynamic because of the `locale` query parameter; cached by the header below.
export const dynamic = 'force-dynamic';

const querySchema = z.object({ locale: localeSchema.default('mr') });

type Context = { params: Promise<{ id: string }> };

/** GET /api/products/:id — product detail with variants and similar items. */
export const GET = route(async (request: Request, context: Context) => {
  const { id } = await context.params;
  const { locale } = parseQuery(request, querySchema);

  const product = await getProductDetail(id, locale);
  if (!product) throw ApiError.notFound('Product not found');

  return ok(
    { product },
    { headers: { 'cache-control': 'public, s-maxage=60, stale-while-revalidate=300' } },
  );
});
