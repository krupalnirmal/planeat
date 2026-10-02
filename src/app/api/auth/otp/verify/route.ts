import { ApiError, parseJson, route } from '@/lib/api/handler';
import { ok } from '@/lib/api/response';
import { completeLogin } from '@/lib/auth/login';
import { verifyOtp } from '@/lib/auth/otp';
import { verifyOtpSchema } from '@/lib/validators/auth';

export const dynamic = 'force-dynamic';

const OTP_FAILURE_MESSAGES: Record<string, string> = {
  NOT_FOUND: 'No code was requested for this number',
  EXPIRED: 'That code has expired',
  TOO_MANY_ATTEMPTS: 'Too many wrong attempts',
  MISMATCH: 'That code is not correct',
};

/**
 * POST /api/auth/otp/verify
 *
 * Verifies the code, creates the user on first login, and starts a session.
 * `isNewUser` tells the client whether to route into the profile step (M1).
 *
 * This is the locally-issued-code path (SMS_PROVIDER=mock/msg91 via
 * src/lib/auth/otp.ts). The MSG91 Widget path is a separate route —
 * POST /api/auth/otp/verify-widget — since the widget hands back a signed
 * access-token instead of a code; both share `completeLogin` for everything
 * after the OTP/token itself is confirmed.
 */
export const POST = route(async (request: Request) => {
  const { phone, code, context } = await parseJson(request, verifyOtpSchema);

  const result = await verifyOtp(phone, code, 'LOGIN');

  if (!result.ok) {
    const status = result.reason === 'TOO_MANY_ATTEMPTS' ? 429 : 401;
    throw new ApiError(
      result.reason === 'TOO_MANY_ATTEMPTS' ? 'RATE_LIMITED' : 'UNAUTHORIZED',
      OTP_FAILURE_MESSAGES[result.reason],
      status,
      { reason: result.reason },
    );
  }

  const { user, isNewUser } = await completeLogin(phone, context);

  return ok({ user, isNewUser });
});
