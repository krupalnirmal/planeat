import { z } from 'zod';
import { ApiError, parseJson, parseQuery, route } from '@/lib/api/handler';
import { ok } from '@/lib/api/response';
import { requireUser } from '@/lib/auth/session';
import { confirmSwap } from '@/lib/meal-plan/swap';
import { localeSchema } from '@/lib/validators/common';
import { confirmSwapSchema } from '@/lib/validators/meal-plan';

export const dynamic = 'force-dynamic';

const querySchema = z.object({ locale: localeSchema.default('mr') });

/**
 * POST /api/meal-plan/swap/confirm — B6, applied immediately.
 *
 * The chosen product must be one of the three we offered, and the safety
 * filters are re-run at this moment rather than trusted from when the
 * suggestions were made: stock runs out and profiles change in between.
 *
 * The rejected vegetable is added to `disliked_product_ids` — but only when
 * the reason actually meant "not this one". Swapping because something was out
 * of stock should not blacklist a vegetable the customer likes.
 */
export const POST = route(async (request: Request) => {
  const session = await requireUser();
  const { locale } = parseQuery(request, querySchema);
  const input = await parseJson(request, confirmSwapSchema);

  const result = await confirmSwap({
    swapRequestId: input.swapRequestId,
    userId: session.userId,
    productId: input.productId,
    locale,
  });

  if (result.ok) {
    return ok({
      applied: true,
      mealPlanItemId: result.mealPlanItemId,
      productId: result.productId,
      name: result.name,
      quantity: result.quantity,
      unit: result.unit,
    });
  }

  switch (result.reason) {
    case 'REQUEST_NOT_FOUND':
      throw ApiError.notFound('That swap request was not found');
    case 'ALREADY_RESOLVED':
      throw ApiError.conflict('That swap has already been dealt with');
    case 'NOT_SUGGESTED':
      // Not one of the three we offered — this is a client bypassing the
      // filters that produced them.
      throw ApiError.badRequest('That vegetable was not one of the suggestions');
    case 'UNSAFE':
      // Re-validation refused it: out of stock, delisted, or newly filtered by
      // an allergy added since the suggestions were generated.
      throw ApiError.conflict('That vegetable is no longer available for your plan');
  }
});
