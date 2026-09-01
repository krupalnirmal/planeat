import { ApiError, route } from '@/lib/api/handler';
import { ERROR_CODES, fail, ok } from '@/lib/api/response';
import { requireUser } from '@/lib/auth/session';
import { env } from '@/lib/env';
import { initiateOrderPayment } from '@/lib/orders/pay';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

/**
 * POST /api/orders/:id/pay/initiate
 *
 * Records the intent and returns what the browser needs to open the
 * gateway's checkout for an already-placed RAZORPAY order. **It does not
 * mark the order paid.** That happens only when a signature-verified
 * webhook arrives (P2) — see src/lib/wallet/webhook.ts.
 *
 * Safe to call again for the same order (the checkout screen does exactly
 * this if the first attempt is dismissed or fails): each call opens a fresh
 * gateway order against a new `Payment` row, and only ever needs one of
 * them to actually land.
 */
export const POST = route(async (_request: Request, context: Context) => {
  const session = await requireUser();
  const { id } = await context.params;

  const result = await initiateOrderPayment(id, session.userId);

  if (!result.ok) {
    if (result.reason === 'ORDER_NOT_FOUND') throw ApiError.notFound('Order not found');
    if (result.reason === 'ALREADY_PAID') {
      return fail(ERROR_CODES.CONFLICT, 'This order is already paid', 409, { reason: result.reason });
    }
    if (result.reason === 'WRONG_PAYMENT_METHOD') {
      return fail(ERROR_CODES.BAD_REQUEST, 'This order is not set up for online payment', 422, {
        reason: result.reason,
      });
    }
    throw new ApiError(ERROR_CODES.PROVIDER_ERROR, result.message, 502);
  }

  return ok({
    paymentId: result.paymentId,
    provider: result.provider,
    gatewayOrderId: result.gatewayOrderId,
    publicKey: result.publicKey,
    amountPaise: result.amountPaise,
    currency: result.currency,
    /** Lets the UI show the mock's simulate button instead of a real widget. */
    isMock: env.providers.payment === 'mock',
  });
});
