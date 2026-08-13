import { db } from '@/lib/db';
import { env } from '@/lib/env';
import { ID_PREFIX, newId } from '@/lib/ids';
import { isMockSms } from '@/lib/services/sms';
import type { OtpPurpose } from '@/generated/prisma/enums';
import { MAX_REQUESTS_PER_HOUR, RESEND_COOLDOWN_SECONDS } from './otp-constants';

/**
 * OTP issue and verification (M1).
 *
 * Rules from the brief, all enforced here rather than in the route:
 *   6 digits · 5-minute expiry · max 5 attempts · 60 s resend cooldown ·
 *   max 5 requests per number per hour.
 *
 * Codes are stored as an HMAC, never in plain text. An OTP is a password for
 * five minutes, and a database leak must not hand over live login codes.
 */

export {
  MAX_REQUESTS_PER_HOUR,
  RESEND_COOLDOWN_SECONDS,
  WHATSAPP_FALLBACK_SECONDS,
} from './otp-constants';

export type OtpIssueResult =
  | { ok: true; code: string; expiresAt: Date; retryAfterSeconds: number }
  | { ok: false; reason: 'COOLDOWN' | 'HOURLY_LIMIT'; retryAfterSeconds: number };

export type OtpVerifyResult =
  | { ok: true }
  | { ok: false; reason: 'NOT_FOUND' | 'EXPIRED' | 'TOO_MANY_ATTEMPTS' | 'MISMATCH' };

/** Normalises to bare 10 digits — the form Indian numbers are stored in. */
export function normalisePhone(input: string): string {
  const digits = input.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1);
  return digits;
}

export function isValidIndianMobile(phone: string): boolean {
  return /^[6-9]\d{9}$/.test(normalisePhone(phone));
}

function randomSixDigits(): string {
  const bytes = new Uint32Array(1);
  crypto.getRandomValues(bytes);
  return String(bytes[0] % 1_000_000).padStart(6, '0');
}

/**
 * While SMS_PROVIDER=mock the code is the fixed development OTP, so a
 * developer or a demo never has to read a log line to log in.
 */
export function generateOtpCode(): string {
  return isMockSms() ? env.sms.devFixedOtp : randomSixDigits();
}

async function hashCode(phone: string, code: string): Promise<string> {
  // Keyed by the server secret and bound to the phone number, so a hash from
  // one row cannot be replayed against another.
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(env.auth.jwtSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`${phone}:${code}`),
  );
  return [...new Uint8Array(signature)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Issues a code, or refuses with the number of seconds to wait.
 *
 * Both limits exist for different reasons: the 60 s cooldown stops a user
 * hammering "resend" and racing two live codes, while the hourly cap stops
 * someone using our SMS credit to spam a stranger's phone.
 */
export async function issueOtp(
  phoneInput: string,
  purpose: OtpPurpose = 'LOGIN',
  now: Date = new Date(),
): Promise<OtpIssueResult> {
  const phone = normalisePhone(phoneInput);

  const hourAgo = new Date(now.getTime() - 3_600_000);
  const recent = await db.otpRequest.findMany({
    where: { phone, purpose, createdAt: { gte: hourAgo } },
    select: { createdAt: true },
    orderBy: { createdAt: 'desc' },
  });

  if (recent.length >= MAX_REQUESTS_PER_HOUR) {
    const oldest = recent[recent.length - 1].createdAt;
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((oldest.getTime() + 3_600_000 - now.getTime()) / 1000),
    );
    return { ok: false, reason: 'HOURLY_LIMIT', retryAfterSeconds };
  }

  if (recent.length > 0) {
    const sinceLast = (now.getTime() - recent[0].createdAt.getTime()) / 1000;
    if (sinceLast < RESEND_COOLDOWN_SECONDS) {
      return {
        ok: false,
        reason: 'COOLDOWN',
        retryAfterSeconds: Math.ceil(RESEND_COOLDOWN_SECONDS - sinceLast),
      };
    }
  }

  const code = generateOtpCode();
  const expiresAt = new Date(now.getTime() + env.auth.otpTtlSeconds * 1000);

  // Any earlier live code for this number is spent: two valid codes at once
  // doubles the guessing surface for no benefit.
  await db.otpRequest.updateMany({
    where: { phone, purpose, consumedAt: null, expiresAt: { gt: now } },
    data: { consumedAt: now },
  });

  await db.otpRequest.create({
    data: {
      id: newId(ID_PREFIX.otp),
      phone,
      purpose,
      codeHash: await hashCode(phone, code),
      maxAttempts: env.auth.otpMaxAttempts,
      expiresAt,
    },
  });

  return { ok: true, code, expiresAt, retryAfterSeconds: RESEND_COOLDOWN_SECONDS };
}

/**
 * Verifies and consumes a code. A wrong attempt increments the counter; the
 * fifth wrong attempt burns the code so a slow brute force cannot outlast it.
 */
export async function verifyOtp(
  phoneInput: string,
  code: string,
  purpose: OtpPurpose = 'LOGIN',
  now: Date = new Date(),
): Promise<OtpVerifyResult> {
  const phone = normalisePhone(phoneInput);

  const request = await db.otpRequest.findFirst({
    where: { phone, purpose, consumedAt: null },
    orderBy: { createdAt: 'desc' },
  });

  if (!request) return { ok: false, reason: 'NOT_FOUND' };

  if (request.expiresAt <= now) {
    await db.otpRequest.update({ where: { id: request.id }, data: { consumedAt: now } });
    return { ok: false, reason: 'EXPIRED' };
  }

  if (request.attempts >= request.maxAttempts) {
    await db.otpRequest.update({ where: { id: request.id }, data: { consumedAt: now } });
    return { ok: false, reason: 'TOO_MANY_ATTEMPTS' };
  }

  const expected = await hashCode(phone, code.trim());
  if (!safeEqual(expected, request.codeHash)) {
    const attempts = request.attempts + 1;
    await db.otpRequest.update({
      where: { id: request.id },
      data: {
        attempts,
        // Burn the code on the final failure rather than leaving it alive.
        consumedAt: attempts >= request.maxAttempts ? now : null,
      },
    });
    return {
      ok: false,
      reason: attempts >= request.maxAttempts ? 'TOO_MANY_ATTEMPTS' : 'MISMATCH',
    };
  }

  await db.otpRequest.update({ where: { id: request.id }, data: { consumedAt: now } });
  return { ok: true };
}
