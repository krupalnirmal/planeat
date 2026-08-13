import { ApiError, parseJson, route } from '@/lib/api/handler';
import { ok } from '@/lib/api/response';
import {
  RESEND_COOLDOWN_SECONDS,
  WHATSAPP_FALLBACK_SECONDS,
  issueOtp,
} from '@/lib/auth/otp';
import { env } from '@/lib/env';
import { getSmsProvider, isMockSms } from '@/lib/services/sms';
import { sendOtpSchema } from '@/lib/validators/auth';

export const dynamic = 'force-dynamic';

/**
 * POST /api/auth/otp/send
 *
 * B16 — SMS is used for OTP and nothing else. WhatsApp is offered as the
 * resend channel 30 seconds in, because SMS delivery in this segment is
 * unreliable and the business already runs on WhatsApp.
 */
export const POST = route(async (request: Request) => {
  const { phone, channel, locale } = await parseJson(request, sendOtpSchema);

  const issued = await issueOtp(phone, 'LOGIN');

  if (!issued.ok) {
    throw ApiError.rateLimited(
      issued.reason === 'COOLDOWN'
        ? 'Please wait before requesting another code'
        : 'Too many codes requested for this number',
      { reason: issued.reason, retryAfterSeconds: issued.retryAfterSeconds },
    );
  }

  const sms = getSmsProvider();
  const result = await sms.sendOtp({
    phone,
    code: issued.code,
    ttlSeconds: env.auth.otpTtlSeconds,
    locale,
  });

  if (!result.accepted) {
    // The code is already issued and valid, so the user can still retry the
    // send. Surfacing the provider failure beats pretending it worked.
    throw new ApiError('PROVIDER_ERROR', result.error ?? 'Could not send the code', 502);
  }

  return ok({
    sent: true,
    channel,
    expiresAt: issued.expiresAt.toISOString(),
    resendAfterSeconds: RESEND_COOLDOWN_SECONDS,
    whatsappFallbackAfterSeconds: WHATSAPP_FALLBACK_SECONDS,
    // Only ever populated while SMS_PROVIDER=mock, so a developer or a demo
    // does not have to read the server console to log in.
    devCode: isMockSms() ? issued.code : null,
  });
});
