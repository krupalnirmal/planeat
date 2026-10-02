import { z } from 'zod';
import { localeSchema, otpCodeSchema, phoneSchema } from './common';

export const sendOtpSchema = z.object({
  phone: phoneSchema,
  /** M1 — "resend via WhatsApp" is offered 30 s after the SMS. */
  channel: z.enum(['sms', 'whatsapp']).default('sms'),
  locale: localeSchema.optional(),
});
export type SendOtpInput = z.infer<typeof sendOtpSchema>;

export const verifyOtpSchema = z.object({
  phone: phoneSchema,
  code: otpCodeSchema,
  // 'staff' — the `/staff/login` entry point (session 2026-09-17). Same OTP
  // backend as the customer flow; this flag only changes what happens for a
  // phone with no staff access (see the verify route).
  context: z.enum(['staff']).optional(),
});
export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>;

/**
 * MSG91 OTP Widget path (session 2026-10-02) — the widget generates and
 * verifies the code itself client-side (no DLT needed, unlike the Flow API),
 * and hands back a signed access-token instead of a code. See
 * src/app/api/auth/otp/verify-widget/route.ts.
 */
export const verifyWidgetOtpSchema = z.object({
  phone: phoneSchema,
  accessToken: z.string().trim().min(10),
  context: z.enum(['staff']).optional(),
});
export type VerifyWidgetOtpInput = z.infer<typeof verifyWidgetOtpSchema>;

export const updateMeSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  email: z.email().max(190).optional().or(z.literal('')),
  dob: z.iso.date().optional(),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER', 'UNDISCLOSED']).optional(),
  preferredLanguage: localeSchema.optional(),
});
export type UpdateMeInput = z.infer<typeof updateMeSchema>;
