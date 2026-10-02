import { ApiError, parseJson, route } from '@/lib/api/handler';
import { ok } from '@/lib/api/response';
import { completeLogin } from '@/lib/auth/login';
import { env } from '@/lib/env';
import { verifyWidgetOtpSchema } from '@/lib/validators/auth';

export const dynamic = 'force-dynamic';

interface VerifyAccessTokenResponse {
  type?: string;
  message?: string;
}

/**
 * POST /api/auth/otp/verify-widget
 *
 * MSG91 OTP Widget path (session 2026-10-02) — chosen over waiting for the
 * client's own DLT/PE ID registration (3-7 days + fee): the Widget sends and
 * verifies the OTP itself from the browser (src/lib/auth/msg91-widget.ts),
 * riding MSG91's own already-approved DLT entity rather than the client's.
 *
 * The widget's client-side success callback is a UI signal only (P2, same
 * doctrine as Razorpay's checkout widget) — this confirms the access-token
 * server-to-server with MSG91 before ever starting a session. Everything
 * after that is identical to the code-based path, via `completeLogin`.
 */
export const POST = route(async (request: Request) => {
  const { phone, accessToken, context } = await parseJson(request, verifyWidgetOtpSchema);

  if (!env.sms.msg91AuthKey) {
    throw new ApiError('PROVIDER_ERROR', 'MSG91_AUTH_KEY is not set.', 502);
  }

  const res = await fetch('https://control.msg91.com/api/v5/widget/verifyAccessToken', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ authkey: env.sms.msg91AuthKey, 'access-token': accessToken }),
  });

  const json = (await res.json()) as VerifyAccessTokenResponse;

  if (!res.ok || json.type !== 'success') {
    throw new ApiError('UNAUTHORIZED', 'That verification could not be confirmed', 401, {
      reason: 'MISMATCH',
    });
  }

  const { user, isNewUser } = await completeLogin(phone, context);

  return ok({ user, isNewUser });
});
