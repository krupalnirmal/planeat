import { ApiError, parseJson, route } from '@/lib/api/handler';
import { ERROR_CODES, fail, ok } from '@/lib/api/response';
import { requireUser } from '@/lib/auth/session';
import { env } from '@/lib/env';
import { initiateTopup } from '@/lib/wallet/topup';
import { initiateTopupSchema } from '@/lib/validators/wallet';

export const dynamic = 'force-dynamic';

/**
 * POST /api/wallet/topup/initiate
 *
 * Records the intent and returns what the browser needs to open the gateway's
 * checkout. **It does not credit anything.** The wallet moves only when a
 * signature-verified webhook arrives (P2).
 *
 * The response is provider-neutral (`gatewayOrderId`, `publicKey`) so the UI
 * does not have to know which gateway is behind it (P5).
 */
export const POST = route(async (request: Request) => {
  const session = await requireUser();
  const { amountPaise } = await parseJson(request, initiateTopupSchema);

  const result = await initiateTopup({
    userId: session.userId,
    amountPaise: BigInt(amountPaise),
  });

  if (!result.ok) {
    if (result.reason === 'BELOW_MINIMUM') {
      return fail(ERROR_CODES.BAD_REQUEST, 'Amount is below the minimum top-up', 422, {
        reason: result.reason,
        minimumPaise: result.minimumPaise,
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
