import { z } from 'zod';
import { parseJson, parseQuery, route } from '@/lib/api/handler';
import { ok } from '@/lib/api/response';
import { requireUser } from '@/lib/auth/session';
import { createFromText } from '@/lib/smart-list/pipeline';
import { listSmartLists } from '@/lib/smart-list/queries';
import { localeSchema, paginate, paginationSchema } from '@/lib/validators/common';
import { smartListTextSchema } from '@/lib/validators/smart-list';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const createQuerySchema = z.object({ locale: localeSchema.default('mr') });

/** GET /api/smart-list — M4's saved lists, for reuse ("Weekly Sabzi"). */
export const GET = route(async (request: Request) => {
  const session = await requireUser();
  const query = parseQuery(request, paginationSchema);

  const { lists, total } = await listSmartLists(session.userId, paginate(query));

  return ok({
    lists,
    page: query.page,
    perPage: query.perPage,
    total,
    hasMore: query.page * query.perPage < total,
  });
});

/**
 * POST /api/smart-list — the typed path.
 *
 * M4 — "If AI is unavailable, fall back to manual list entry." This is that
 * entry point, and it is not a degraded one: the deterministic parser handles
 * "दोन किलो कांदा, अर्धा किलो बटाटा" without a model at all.
 */
export const POST = route(async (request: Request) => {
  const session = await requireUser();
  const { locale } = parseQuery(request, createQuerySchema);
  const { text } = await parseJson(request, smartListTextSchema);

  const result = await createFromText({ userId: session.userId, text, locale });

  return ok(
    { smartListId: result.smartListId, usedFallback: result.usedFallback },
    { status: 201 },
  );
});
