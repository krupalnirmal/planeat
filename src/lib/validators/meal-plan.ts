import { z } from 'zod';
import { DURATION_OPTIONS } from '@/lib/meal-plan/pricing';
import { cuidSchema } from './common';

/** M5 — the swap reasons offered to the customer. */
export const swapReasonSchema = z.enum([
  'DONT_LIKE',
  'ALLERGIC',
  'NOT_AVAILABLE',
  'TOO_EXPENSIVE',
  'OTHER',
]);

export const requestSwapSchema = z.object({
  reasonCode: swapReasonSchema,
  reasonText: z.string().trim().max(255).optional(),
});
export type RequestSwapInput = z.infer<typeof requestSwapSchema>;

export const confirmSwapSchema = z.object({
  swapRequestId: cuidSchema,
  productId: cuidSchema,
});
export type ConfirmSwapInput = z.infer<typeof confirmSwapSchema>;

/** B5 — 7 / 15 / 30 days, and nothing else. */
const durationSchema = z.coerce
  .number()
  .int()
  .refine((value) => (DURATION_OPTIONS as readonly number[]).includes(value), {
    message: `Duration must be one of ${DURATION_OPTIONS.join(', ')} days`,
  });

export const approvalQuoteSchema = z.object({
  durationDays: durationSchema.optional(),
  startDate: z.iso.date().optional(),
});
export type ApprovalQuoteInput = z.infer<typeof approvalQuoteSchema>;

export const approveMealPlanSchema = z.object({
  addressId: cuidSchema,
  durationDays: durationSchema,
  startDate: z.iso.date(),
  deliverySlot: z.enum(['SUBSCRIPTION_0630_0900']).optional(),
});
export type ApproveMealPlanInput = z.infer<typeof approveMealPlanSchema>;
