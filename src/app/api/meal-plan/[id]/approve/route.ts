import { ApiError, parseJson, parseQuery, route } from '@/lib/api/handler';
import { ERROR_CODES, fail, ok } from '@/lib/api/response';
import { requireUser } from '@/lib/auth/session';
import { approveMealPlan, buildApprovalQuote } from '@/lib/meal-plan/approve';
import { approvalQuoteSchema, approveMealPlanSchema } from '@/lib/validators/meal-plan';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

/**
 * GET /api/meal-plan/:id/approve — the approval quote.
 *
 * B2 — the screen must show the estimated daily cost, the estimated period
 * total, the plan fee, and a clear "prices vary daily with market rates" line.
 * Everything but that last sentence comes from here; the sentence is a
 * translated string, because it is a promise to the customer.
 */
export const GET = route(async (request: Request, context: Context) => {
  const session = await requireUser();
  const { id } = await context.params;
  const query = parseQuery(request, approvalQuoteSchema);

  const quote = await buildApprovalQuote({
    mealPlanId: id,
    userId: session.userId,
    durationDays: query.durationDays,
    startDate: query.startDate,
  });

  if (!quote) throw ApiError.notFound('Meal plan not found');
  return ok(quote);
});

/**
 * POST /api/meal-plan/:id/approve — B3's prepayment and the subscription.
 *
 * A short balance is NOT an error to shrug at: the response carries the exact
 * shortfall so the client can send the customer straight to a top-up for that
 * amount and bring them back here.
 */
export const POST = route(async (request: Request, context: Context) => {
  const session = await requireUser();
  const { id } = await context.params;
  const input = await parseJson(request, approveMealPlanSchema);

  const result = await approveMealPlan({
    mealPlanId: id,
    userId: session.userId,
    addressId: input.addressId,
    durationDays: input.durationDays,
    startDate: input.startDate,
    deliverySlot: input.deliverySlot,
  });

  if (result.ok) {
    return ok(
      {
        subscriptionId: result.subscriptionId,
        startDate: result.startDate,
        endDate: result.endDate,
        planFeePaise: result.planFeePaise,
        reservedPaise: result.reservedPaise,
      },
      { status: 201 },
    );
  }

  switch (result.reason) {
    case 'PLAN_NOT_FOUND':
      throw ApiError.notFound('Meal plan not found');

    case 'ADDRESS_NOT_FOUND':
      throw ApiError.notFound('Delivery address not found');

    case 'ALREADY_APPROVED':
      // Idempotent: hand back the subscription that already exists rather than
      // creating a second one and charging the plan fee again.
      return ok({ subscriptionId: result.subscriptionId, alreadyApproved: true });

    case 'INCOMPLETE_PLAN':
      throw ApiError.conflict('This plan is missing days and cannot be started');

    case 'INSUFFICIENT_BALANCE':
      return fail(
        ERROR_CODES.INSUFFICIENT_BALANCE,
        'Add money to your wallet to start this plan',
        402,
        {
          reason: result.reason,
          requiredPaise: result.requiredPaise,
          availablePaise: result.availablePaise,
          shortfallPaise: result.shortfallPaise,
        },
      );
  }
});
