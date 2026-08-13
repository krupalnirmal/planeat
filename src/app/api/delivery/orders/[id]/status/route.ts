import { ApiError, parseJson, route } from '@/lib/api/handler';
import { ok } from '@/lib/api/response';
import { requireDeliveryPartner } from '@/lib/delivery/guard';
import { advanceAssignment } from '@/lib/delivery/status';
import { advanceStatusSchema } from '@/lib/validators/delivery';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

const MESSAGE: Record<string, string> = {
  NOT_FOUND: 'No assignment found for that order',
  ILLEGAL_TRANSITION: 'That status change is not allowed from here',
  ORDER_NOT_READY: 'The order has not been packed yet',
  WRONG_OTP: 'That code does not match',
  PROOF_REQUIRED: 'Enter the customer\'s code or attach a proof photo',
  REASON_REQUIRED: 'Give a reason for the failed delivery',
};

/**
 * PATCH /api/delivery/orders/:id/status — Picked Up → Out for Delivery →
 * Delivered, or Failed with a reason (M10). `:id` is the order id, matching
 * the API surface in PART 9; the assignment itself is looked up scoped to
 * the calling rider so nobody can move another rider's delivery.
 */
export const PATCH = route(async (request: Request, context: Context) => {
  const { partnerId } = await requireDeliveryPartner();
  const { id: orderId } = await context.params;
  const input = await parseJson(request, advanceStatusSchema);

  const result = await advanceAssignment({
    orderId,
    partnerId,
    to: input.to,
    otp: input.otp,
    proofImageUrl: input.proofImageUrl,
    failureReason: input.failureReason,
  });

  if (!result.ok) {
    const message = MESSAGE[result.reason] ?? 'Could not update this delivery';
    throw result.reason === 'NOT_FOUND'
      ? ApiError.notFound(message)
      : ApiError.badRequest(message, { reason: result.reason });
  }

  return ok({ orderId, status: input.to });
});
