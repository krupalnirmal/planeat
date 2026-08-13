import { ApiError, parseJson, route } from '@/lib/api/handler';
import { ok } from '@/lib/api/response';
import { requireUser } from '@/lib/auth/session';
import { env } from '@/lib/env';
import { MockPaymentProvider, getPaymentProvider } from '@/lib/services/payment';
import { handlePaymentWebhook } from '@/lib/wallet/webhook';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const schema = z.object({
  gatewayOrderId: z.string().trim().min(1).max(120),
  outcome: z.enum(['captured', 'failed']).default('captured'),
});

/**
 * POST /api/dev/simulate-payment — development and demo only.
 *
 * R2 says the whole app must run end to end with every provider set to mock.
 * A top-up is the one flow where that is hard: there is no gateway to pay at.
 * This route builds a correctly HMAC-SIGNED payload with the mock provider and
 * feeds it through the real webhook handler — the same code path a live
 * Razorpay callback takes, signature check included.
 *
 * It is not a shortcut around the webhook; it is a stand-in for the gateway.
 *
 * Double-guarded: it refuses outside development AND unless
 * PAYMENT_PROVIDER=mock. Either check alone would be one misconfigured
 * environment variable away from being a free-money endpoint.
 */
export const POST = route(async (request: Request) => {
  if (env.isProduction) throw ApiError.notFound('Not found');

  const provider = getPaymentProvider();
  if (!(provider instanceof MockPaymentProvider)) {
    throw ApiError.forbidden('Only available while PAYMENT_PROVIDER=mock');
  }

  // Still requires a logged-in user: this is a demo aid, not an open endpoint.
  await requireUser();

  const { gatewayOrderId, outcome } = await parseJson(request, schema);

  if (outcome === 'failed') {
    return ok({ simulated: 'failed', action: 'IGNORED' });
  }

  const { rawBody, signature } = await provider.simulateCapture(gatewayOrderId);

  // Verified exactly as a real webhook would be — a wrong signature here would
  // fail here too.
  const event = await provider.verifyWebhook({ rawBody, signature });
  if (!event) throw ApiError.badRequest('Mock signature failed to verify');

  const result = await handlePaymentWebhook(event);

  return ok({ simulated: 'captured', action: result.action });
});
