import { z } from 'zod';
import { ApiError, parseQuery, route } from '@/lib/api/handler';
import { ok } from '@/lib/api/response';
import { requireUser } from '@/lib/auth/session';
import { getMealPlanForUser } from '@/lib/meal-plan/queries';
import { localeSchema } from '@/lib/validators/common';

export const dynamic = 'force-dynamic';

const querySchema = z.object({ locale: localeSchema.default('mr') });

type Context = { params: Promise<{ id: string }> };

/**
 * GET /api/meal-plan/:id
 *
 * R9 — ownership is checked inside the query, not by trusting the id. The
 * flag *reason* is never returned to the customer: B8 gives them a plain
 * "please consult a doctor" banner, while the clinical detail goes to the
 * admin review queue.
 */
export const GET = route(async (request: Request, context: Context) => {
  const session = await requireUser();
  const { id } = await context.params;
  const { locale } = parseQuery(request, querySchema);

  const plan = await getMealPlanForUser(id, session.userId, locale);
  if (!plan) throw ApiError.notFound('Meal plan not found');

  return ok({ plan });
});
