import { z } from 'zod';

/** M10 — the rider PWA's own inputs. */

export const advanceStatusSchema = z.object({
  to: z.enum(['PICKED_UP', 'OUT_FOR_DELIVERY', 'DELIVERED', 'FAILED']),
  otp: z
    .string()
    .trim()
    .regex(/^\d{4}$/)
    .optional(),
  proofImageUrl: z.url().max(500).optional(),
  failureReason: z.string().trim().min(3).max(255).optional(),
});

export const availabilitySchema = z.object({
  isAvailable: z.boolean(),
});
