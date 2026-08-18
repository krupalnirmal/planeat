import { z } from 'zod';
import { parseQuery, route } from '@/lib/api/handler';
import { ok } from '@/lib/api/response';
import { requireUser } from '@/lib/auth/session';
import { getCurrentDraft } from '@/lib/meal-plan/draft';
import { localeSchema } from '@/lib/validators/common';

export const dynamic = 'force-dynamic';

const querySchema = z.object({ locale: localeSchema.default('mr') });

/** GET /api/meal-plan/draft/current — the newest draft, or null before one exists. */
export const GET = route(async (request: Request) => {
  const session = await requireUser();
  const { locale } = parseQuery(request, querySchema);

  const draft = await getCurrentDraft(session.userId, locale);
  return ok({ draft });
});
