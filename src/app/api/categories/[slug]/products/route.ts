import { ApiError, parseQuery, route } from '@/lib/api/handler';
import { ok } from '@/lib/api/response';
import { getCategoryProducts } from '@/lib/catalog/queries';
import { localeSchema, paginate, paginationSchema } from '@/lib/validators/common';

// Dynamic because of the query parameters; cached by the header below.
export const dynamic = 'force-dynamic';

const querySchema = paginationSchema.extend({ locale: localeSchema.default('mr') });

type Context = { params: Promise<{ slug: string }> };

/** GET /api/categories/:slug/products — public, paginated, cached. */
export const GET = route(async (request: Request, context: Context) => {
  const { slug } = await context.params;
  const query = parseQuery(request, querySchema);

  const result = await getCategoryProducts(slug, query.locale, paginate(query));
  if (!result) throw ApiError.notFound('Category not found');

  return ok(
    {
      category: result.category,
      products: result.products,
      page: query.page,
      perPage: query.perPage,
      total: result.total,
      hasMore: query.page * query.perPage < result.total,
    },
    { headers: { 'cache-control': 'public, s-maxage=60, stale-while-revalidate=300' } },
  );
});
