import { z } from 'zod';
import { ApiError, clientIp, parseJson, parseQuery, route } from '@/lib/api/handler';
import { ok } from '@/lib/api/response';
import { requireStoreAdmin } from '@/lib/admin/guard';
import { getMealPlanDetail, markPlanReviewed, replacePlanItem } from '@/lib/admin/meal-plans';
import { localeSchema } from '@/lib/validators/common';
import { manualEditSchema, reviewPlanSchema } from '@/lib/validators/admin';

export const dynamic = 'force-dynamic';

const querySchema = z.object({ locale: localeSchema.default('mr') });

type Context = { params: Promise<{ id: string }> };

/**
 * GET /api/admin/meal-plans/:id
 *
 * Unlike the customer's own view, this DOES return `flagReason` and the
 * profile snapshot — that is the whole point of the review queue. D-108 keeps
 * the clinical detail off the customer's screen; it belongs here.
 */
export const GET = route(async (request: Request, context: Context) => {
  await requireStoreAdmin();
  const { id } = await context.params;
  const { locale } = parseQuery(request, querySchema);

  const plan = await getMealPlanDetail(id, locale);
  if (!plan) throw ApiError.notFound('Meal plan not found');

  return ok({ plan });
});

/**
 * POST /api/admin/meal-plans/:id — B8, mark reviewed.
 *
 * This does NOT unflag the plan. The customer keeps their doctor banner
 * because the condition that raised it has not gone away; what changes is that
 * a human has now looked, which is what the queue counts.
 */
export const POST = route(async (request: Request, context: Context) => {
  const session = await requireStoreAdmin();
  const { id } = await context.params;
  const { note } = await parseJson(request, reviewPlanSchema);

  const result = await markPlanReviewed(id, session.userId, note ?? null, clientIp(request));
  if (!result.ok) throw ApiError.notFound('Meal plan not found');

  return ok({ reviewed: true });
});

/**
 * PATCH /api/admin/meal-plans/:id — S7, the manual override.
 *
 *   "Admin can always edit a plan manually. The manual path from the old
 *    business must remain available."
 *
 * The S4 allergen check still runs. An admin edit is a convenience, not an
 * escape hatch: nobody should be able to put a peanut into a peanut-allergic
 * customer's plan through a form.
 */
export const PATCH = route(async (request: Request, context: Context) => {
  const session = await requireStoreAdmin();
  await context.params;
  const input = await parseJson(request, manualEditSchema);

  const result = await replacePlanItem(
    input.mealPlanItemId,
    input.productId,
    session.userId,
    clientIp(request),
  );

  if (!result.ok) {
    switch (result.reason) {
      case 'ITEM_NOT_FOUND':
        throw ApiError.notFound('That meal was not found');
      case 'PRODUCT_NOT_FOUND':
        throw ApiError.notFound('That product is unavailable');
      case 'ALLERGEN':
        throw ApiError.conflict(
          'That product matches an allergy this customer declared, so it cannot go in their plan',
        );
    }
  }

  return ok({ updated: true });
});
