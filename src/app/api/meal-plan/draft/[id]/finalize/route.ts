import { ApiError, route } from '@/lib/api/handler';
import { ERROR_CODES, fail, ok } from '@/lib/api/response';
import { requireUser } from '@/lib/auth/session';
import { finalizeDraft } from '@/lib/meal-plan/draft';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

/**
 * POST /api/meal-plan/draft/[id]/finalize — doc §12/§14: resolves the
 * customer's selections into a real MealPlan (PENDING_CUSTOMER), the same
 * shape `/meal-plan`'s existing screen, swap flow and admin review already
 * work with. Requires every category on every day to have its required
 * selection(s) made first.
 */
export const POST = route(async (_request: Request, context: Context) => {
  const session = await requireUser();
  const { id } = await context.params;

  const result = await finalizeDraft(session.userId, id);

  if (!result.ok) {
    if (result.reason === 'NOT_FOUND') throw ApiError.notFound('Draft not found');
    return fail(ERROR_CODES.BAD_REQUEST, 'Some days are missing a required selection', 422, {
      missing: result.missing,
    });
  }

  return ok({ mealPlanId: result.mealPlanId }, { status: 201 });
});
