import { z } from 'zod';
import { parseQuery, route } from '@/lib/api/handler';
import { ok } from '@/lib/api/response';
import { getCategories } from '@/lib/catalog/queries';
import { localeSchema } from '@/lib/validators/common';

// Dynamic because of the `locale` query parameter; cached by the header below.
export const dynamic = 'force-dynamic';

const querySchema = z.object({ locale: localeSchema.default('mr') });

/** GET /api/categories — public, cached; the owner reorders these in admin. */
export const GET = route(async (request: Request) => {
  const { locale } = parseQuery(request, querySchema);
  const categories = await getCategories(locale);

  return ok(
    { categories },
    { headers: { 'cache-control': 'public, s-maxage=300, stale-while-revalidate=600' } },
  );
});
