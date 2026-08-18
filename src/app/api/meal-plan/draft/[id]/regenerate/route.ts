import { z } from 'zod';
import { ApiError, parseJson, parseQuery, route } from '@/lib/api/handler';
import { ok } from '@/lib/api/response';
import { requireUser } from '@/lib/auth/session';
import { generateMealPlanOptions } from '@/lib/meal-plan/generate-options';
import { localeSchema } from '@/lib/validators/common';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const querySchema = z.object({ locale: localeSchema.default('mr') });
const bodySchema = z.object({ reason: z.string().trim().max(200).nullable().optional() });

/**
 * POST /api/meal-plan/draft/[id]/regenerate — doc §13: re-runs generation
 * from the ALREADY-SAVED profile, no re-entry required. The `[id]` segment
 * keeps the URL RESTful, but `generateMealPlanOptions` always supersedes
 * whatever the customer's own newest draft is (scoped by `userId`), the
 * same "regenerate always acts on your own latest" behaviour as
 * `/api/meal-plan/[id]/regenerate`.
 */
export const POST = route(async (request: Request) => {
  const session = await requireUser();
  const { locale } = parseQuery(request, querySchema);
  const { reason } = await parseJson(request, bodySchema);

  const result = await generateMealPlanOptions({
    userId: session.userId,
    locale,
    regenerateReason: reason ?? null,
  });

  if (!result.ok) {
    if (result.reason === 'NO_PROFILE') throw ApiError.badRequest('No saved profile to regenerate from');
    if (result.reason === 'NO_CONSENT') throw ApiError.forbidden('Consent is required before generating');
    throw ApiError.badRequest(`Not enough options available for ${result.category}`, {
      category: result.category,
      available: result.available,
      required: result.required,
    });
  }

  return ok({ draftId: result.draftId, flaggedForReview: result.flaggedForReview, usedFallback: result.usedFallback });
});
