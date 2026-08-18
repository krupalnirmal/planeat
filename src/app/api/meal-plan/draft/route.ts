import { z } from 'zod';
import { ApiError, parseQuery, route } from '@/lib/api/handler';
import { ok } from '@/lib/api/response';
import { requireUser } from '@/lib/auth/session';
import { generateMealPlanOptions } from '@/lib/meal-plan/generate-options';
import { localeSchema } from '@/lib/validators/common';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const querySchema = z.object({ locale: localeSchema.default('mr') });

/**
 * POST /api/meal-plan/draft — kicks off options generation (AI-1b) from the
 * already-saved HealthProfile (+ FamilyMembers for a family plan). Mirrors
 * POST /api/meal-plan/generate's response-mapping conventions.
 */
export const POST = route(async (request: Request) => {
  const session = await requireUser();
  const { locale } = parseQuery(request, querySchema);

  const result = await generateMealPlanOptions({ userId: session.userId, locale });

  if (!result.ok) {
    if (result.reason === 'NO_PROFILE') {
      throw ApiError.badRequest('Save the meal plan profile before generating');
    }
    if (result.reason === 'NO_CONSENT') {
      throw ApiError.forbidden('Consent is required before generating');
    }
    throw ApiError.badRequest(`Not enough options available for ${result.category}`, {
      category: result.category,
      available: result.available,
      required: result.required,
    });
  }

  return ok(
    { draftId: result.draftId, flaggedForReview: result.flaggedForReview, usedFallback: result.usedFallback },
    { status: 201 },
  );
});
