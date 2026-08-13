import { z } from 'zod';
import { ApiError, parseJson, parseQuery, route } from '@/lib/api/handler';
import { ERROR_CODES, fail, ok } from '@/lib/api/response';
import { requireUser } from '@/lib/auth/session';
import { suggestSwaps } from '@/lib/meal-plan/swap';
import { localeSchema } from '@/lib/validators/common';
import { requestSwapSchema } from '@/lib/validators/meal-plan';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const querySchema = z.object({ locale: localeSchema.default('mr') });

type Context = { params: Promise<{ id: string; itemId: string }> };

/**
 * POST /api/meal-plan/:id/items/:itemId/swap — AI-2, three alternatives.
 *
 * B6 — no admin approval anywhere in this path. The suggestions come back and
 * the customer picks; `/api/meal-plan/swap/confirm` applies it immediately.
 *
 * Every suggestion is drawn from the same filtered candidate list as
 * generation, so an allergen cannot be suggested even if the model tries.
 */
export const POST = route(async (request: Request, context: Context) => {
  const session = await requireUser();
  const { itemId } = await context.params;
  const { locale } = parseQuery(request, querySchema);
  const input = await parseJson(request, requestSwapSchema);

  const result = await suggestSwaps({
    mealPlanItemId: itemId,
    userId: session.userId,
    reasonCode: input.reasonCode,
    reasonText: input.reasonText,
    locale,
  });

  if (result.ok) {
    return ok({
      swapRequestId: result.swapRequestId,
      replacing: result.replacing,
      suggestions: result.suggestions,
    });
  }

  switch (result.reason) {
    case 'ITEM_NOT_FOUND':
      throw ApiError.notFound('That meal was not found');

    case 'NO_PROFILE':
      throw ApiError.badRequest('Fill in your health profile first');

    case 'LIMIT_REACHED':
      // B6 — 10 swaps per plan per week.
      return fail(ERROR_CODES.RATE_LIMITED, 'You have used all your swaps this week', 429, {
        reason: result.reason,
        used: result.used,
        limit: result.limit,
      });

    case 'NO_ALTERNATIVES':
      return fail(
        ERROR_CODES.BAD_REQUEST,
        'There are not enough suitable alternatives in stock right now',
        422,
        { reason: result.reason },
      );
  }
});
