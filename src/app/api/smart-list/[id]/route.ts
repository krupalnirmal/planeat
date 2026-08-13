import { z } from 'zod';
import { ApiError, parseJson, parseQuery, route } from '@/lib/api/handler';
import { ok } from '@/lib/api/response';
import { requireUser } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { getSmartList } from '@/lib/smart-list/queries';
import { localeSchema } from '@/lib/validators/common';
import { renameSmartListSchema } from '@/lib/validators/smart-list';

export const dynamic = 'force-dynamic';

const querySchema = z.object({ locale: localeSchema.default('mr') });

type Context = { params: Promise<{ id: string }> };

/**
 * GET /api/smart-list/:id — the review screen's data.
 *
 * M4 colour-codes it: matched green, ambiguous amber with the top 3 to choose
 * from, unmatched grey. Every row comes back, including the ones we could not
 * match — "never silently dropped" is the whole point.
 */
export const GET = route(async (request: Request, context: Context) => {
  const session = await requireUser();
  const { id } = await context.params;
  const { locale } = parseQuery(request, querySchema);

  const list = await getSmartList(id, session.userId, locale);
  if (!list) throw ApiError.notFound('That list was not found');

  return ok({ list });
});

/** PATCH /api/smart-list/:id — M4's "name and reuse". */
export const PATCH = route(async (request: Request, context: Context) => {
  const session = await requireUser();
  const { id } = await context.params;
  const { name } = await parseJson(request, renameSmartListSchema);

  const owned = await db.smartList.findUnique({ where: { id }, select: { userId: true } });
  if (!owned || owned.userId !== session.userId) throw ApiError.notFound('That list was not found');

  await db.smartList.update({ where: { id }, data: { name } });

  return ok({ renamed: true, name });
});
