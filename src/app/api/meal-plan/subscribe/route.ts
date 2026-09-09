import { z } from 'zod';
import { ApiError, parseJson, parseQuery, route } from '@/lib/api/handler';
import { ERROR_CODES, ok } from '@/lib/api/response';
import { requireUser } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { activateSubscription, getSubscriptionQuote } from '@/lib/meal-plan/subscribe';
import { cuidSchema } from '@/lib/validators/common';

export const dynamic = 'force-dynamic';

const DURATION_OPTIONS = [7, 15, 30] as const;

const quoteQuerySchema = z.object({
  durationDays: z.coerce.number().int().refine((n) => (DURATION_OPTIONS as readonly number[]).includes(n)),
  startDate: z.iso.date(),
});

/**
 * GET /api/meal-plan/subscribe — the review screen's live quote. Resolves
 * the caller's OWN current plan server-side; a mealPlanId is never accepted
 * from the client.
 */
export const GET = route(async (request: Request) => {
  const session = await requireUser();
  const { durationDays, startDate } = parseQuery(request, quoteQuerySchema);

  const plan = await db.mealPlan.findFirst({
    where: { userId: session.userId, generatedBy: 'CUSTOMER' },
    orderBy: { version: 'desc' },
    select: { id: true },
  });
  if (!plan) throw ApiError.notFound("You haven't saved a meal plan yet");

  const quote = await getSubscriptionQuote(session.userId, plan.id, durationDays, startDate);
  return ok({ quote });
});

const activateSchema = z.object({
  addressId: cuidSchema,
  durationDays: z.coerce.number().int().refine((n) => (DURATION_OPTIONS as readonly number[]).includes(n)),
  startDate: z.iso.date(),
});

/**
 * POST /api/meal-plan/subscribe — the missing Phase 5: creates the
 * `Subscription` row `generateDailyOrders`/`retryPendingPayments` have been
 * reading from since before anything ever wrote one.
 */
export const POST = route(async (request: Request) => {
  const session = await requireUser();
  const input = await parseJson(request, activateSchema);

  const result = await activateSubscription(session.userId, {
    addressId: input.addressId,
    durationDays: input.durationDays,
    startDateKey: input.startDate,
  });

  if (result.ok) {
    return ok({ subscriptionId: result.subscriptionId }, { status: 201 });
  }

  switch (result.reason) {
    case 'NO_PLAN':
      throw ApiError.notFound("You haven't saved a meal plan yet");
    case 'EMPTY_PLAN':
      throw ApiError.badRequest('Add at least one item to your plan before subscribing');
    case 'ALREADY_ACTIVE':
      throw ApiError.conflict('You already have an active subscription');
    case 'ADDRESS_NOT_FOUND':
      throw ApiError.notFound('Delivery address not found');
    case 'INSUFFICIENT_BALANCE':
      throw new ApiError(ERROR_CODES.INSUFFICIENT_BALANCE, 'Your wallet balance is too low', 402, {
        shortfallPaise: result.shortfallPaise?.toString(),
      });
  }
});
