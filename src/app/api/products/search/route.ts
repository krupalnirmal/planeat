import { z } from 'zod';
import { parseQuery, route } from '@/lib/api/handler';
import { ok } from '@/lib/api/response';
import { searchProducts } from '@/lib/catalog/queries';
import { localeSchema } from '@/lib/validators/common';

export const dynamic = 'force-dynamic';

const querySchema = z.object({
  q: z.string().trim().max(80).default(''),
  locale: localeSchema.default('mr'),
  limit: z.coerce.number().int().min(1).max(40).default(20),
});

/**
 * GET /api/products/search?q=&locale=
 *
 * PART 12 — must find कांदा, `kanda` and `onion` as the same product. The
 * `product_aliases` table carries that, not the model.
 *
 * Not cached: queries are long-tailed, so a shared cache would mostly store
 * misses. The endpoint is two indexed queries and stays cheap.
 */
export const GET = route(async (request: Request) => {
  const { q, locale, limit } = parseQuery(request, querySchema);

  if (q.trim().length === 0) {
    return ok({ query: q, products: [] });
  }

  const products = await searchProducts(q, locale, limit);
  return ok({ query: q, products });
});
