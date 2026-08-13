/**
 * OTP timing constants, kept in their own module with no imports.
 *
 * The login screen needs the resend cooldown and the WhatsApp fallback delay,
 * and it is a client component. Importing them from `otp.ts` would drag Prisma
 * into the browser bundle (R10 — the initial JS budget is 200 KB gzipped).
 */

export const RESEND_COOLDOWN_SECONDS = 60;
export const MAX_REQUESTS_PER_HOUR = 5;

/** M1 — offer "resend via WhatsApp" after 30 s. */
export const WHATSAPP_FALLBACK_SECONDS = 30;
