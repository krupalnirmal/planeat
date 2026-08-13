import { z } from 'zod';
import { ApiError, parseQuery, route } from '@/lib/api/handler';
import { ERROR_CODES, fail, ok } from '@/lib/api/response';
import { requireUser } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { generateMealPlan } from '@/lib/meal-plan/generate';
import { localeSchema } from '@/lib/validators/common';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const querySchema = z.object({ locale: localeSchema.default('mr') });

type Context = { params: Promise<{ id: string }> };

/**
 * POST /api/meal-plan/:id/regenerate
 *
 * B5 — "Regeneration creates a NEW version." The old plan is superseded, not
 * overwritten, so a running subscription keeps serving from the template it
 * was approved against until the next Monday. Phase 6 depends on that history
 * existing.
 */
export const POST = route(async (request: Request, context: Context) => {
  const session = await requireUser();
  const { id } = await context.params;
  const { locale } = parseQuery(request, querySchema);

  // R9 — ownership before anything expensive happens.
  const existing = await db.mealPlan.findUnique({
    where: { id },
    select: { userId: true },
  });
  if (!existing || existing.userId !== session.userId) {
    throw ApiError.notFound('Meal plan not found');
  }

  const result = await generateMealPlan({ userId: session.userId, locale });

  if (result.ok) {
    return ok({
      mealPlanId: result.mealPlanId,
      version: result.version,
      flaggedForReview: result.flaggedForReview,
      usedFallback: result.usedFallback,
    });
  }

  switch (result.reason) {
    case 'NO_PROFILE':
      throw ApiError.badRequest('Fill in your health profile first');
    case 'NO_CONSENT':
      throw ApiError.forbidden('Consent is required before a plan can be generated');
    case 'NOT_ENOUGH_CANDIDATES':
      return fail(
        ERROR_CODES.BAD_REQUEST,
        'There are not enough suitable vegetables in stock to build a full week',
        422,
        { reason: result.reason, available: result.available, required: result.required },
      );
  }
});
