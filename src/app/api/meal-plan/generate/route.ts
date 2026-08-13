import { z } from 'zod';
import { ApiError, parseQuery, route } from '@/lib/api/handler';
import { ERROR_CODES, fail, ok } from '@/lib/api/response';
import { requireUser } from '@/lib/auth/session';
import { generateMealPlan } from '@/lib/meal-plan/generate';
import { localeSchema } from '@/lib/validators/common';

export const dynamic = 'force-dynamic';

/**
 * PART 12 — "Plan generates in under 60 seconds." The AI call plus one retry
 * has to fit inside the function's budget, so the ceiling is set explicitly
 * rather than left to the platform default.
 */
export const maxDuration = 60;

const querySchema = z.object({ locale: localeSchema.default('mr') });

/**
 * POST /api/meal-plan/generate
 *
 * Runs the PART 6.3 pipeline. Every hard constraint — allergens, dislikes,
 * catalogue membership — is enforced in code on both sides of the model call,
 * so this route cannot return an unsafe plan even if the model misbehaves.
 */
export const POST = route(async (request: Request) => {
  const session = await requireUser();
  const { locale } = parseQuery(request, querySchema);

  const result = await generateMealPlan({ userId: session.userId, locale });

  if (result.ok) {
    return ok(
      {
        mealPlanId: result.mealPlanId,
        version: result.version,
        flaggedForReview: result.flaggedForReview,
        /** Surfaced honestly: the customer sees a plan either way. */
        usedFallback: result.usedFallback,
      },
      { status: 201 },
    );
  }

  switch (result.reason) {
    case 'NO_PROFILE':
      throw ApiError.badRequest('Fill in your health profile first');

    case 'NO_CONSENT':
      // S2 — a profile saved without consent must not become a plan.
      throw ApiError.forbidden('Consent is required before a plan can be generated');

    case 'NOT_ENOUGH_CANDIDATES':
      // Usually means the allergy and dislike filters emptied the catalogue.
      // Saying so plainly beats generating a three-day plan and calling it a
      // week.
      return fail(
        ERROR_CODES.BAD_REQUEST,
        'There are not enough suitable vegetables in stock to build a full week',
        422,
        { reason: result.reason, available: result.available, required: result.required },
      );
  }
});
