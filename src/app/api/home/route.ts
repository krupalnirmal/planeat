import { parseQuery, route } from '@/lib/api/handler';
import { ok } from '@/lib/api/response';
import { getHomePayload } from '@/lib/catalog/queries';
import { localeSchema } from '@/lib/validators/common';
import { z } from 'zod';

/**
 * GET /api/home
 *
 * PART 12 — "`/api/home` is cached". This is the highest-traffic endpoint and
 * its content changes only when the owner edits the catalogue.
 *
 * The caching is done by the `cache-control` header below, NOT by an
 * `export const revalidate`. The route reads a `locale` query parameter, which
 * makes it dynamic by definition — declaring `revalidate` on it only made Next
 * attempt a static prerender at build time and fail. A shared CDN cache with
 * stale-while-revalidate is what actually removes the database load.
 */
export const dynamic = 'force-dynamic';

const querySchema = z.object({ locale: localeSchema.default('mr') });

export const GET = route(async (request: Request) => {
  const { locale } = parseQuery(request, querySchema);
  const payload = await getHomePayload(locale);

  return ok(payload, {
    headers: {
      'cache-control': 'public, s-maxage=60, stale-while-revalidate=300',
    },
  });
});
