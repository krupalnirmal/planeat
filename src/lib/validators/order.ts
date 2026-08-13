import { z } from 'zod';
import { ISSUE_REASON_CODES } from '@/lib/orders/issues';
import { cuidSchema } from './common';

/** M3 — instant order slots. The subscription slot is set by Phase 6, not here. */
export const instantSlotSchema = z.enum(['EXPRESS', 'MORNING_7_9', 'EVENING_5_7']);

export const paymentMethodSchema = z.enum(['WALLET', 'RAZORPAY', 'COD']);

export const checkoutQuoteSchema = z.object({
  addressId: cuidSchema.optional(),
});
export type CheckoutQuoteInput = z.infer<typeof checkoutQuoteSchema>;

export const placeOrderSchema = z.object({
  addressId: cuidSchema,
  paymentMethod: paymentMethodSchema,
  deliverySlot: instantSlotSchema,
  /**
   * R5 — the client generates this once per checkout attempt and resends the
   * same value on every retry. Without it, a timed-out request that actually
   * succeeded becomes a second order.
   */
  idempotencyKey: z.string().trim().min(8).max(120),
  notes: z.string().trim().max(500).optional(),
});
export type PlaceOrderRequest = z.infer<typeof placeOrderSchema>;

export const cancelOrderSchema = z.object({
  reason: z.string().trim().max(255).optional(),
});

export const reportIssueSchema = z.object({
  reasonCode: z.enum(ISSUE_REASON_CODES),
  description: z.string().trim().max(1000).optional(),
  /** B14 — a photo is what makes an auto-credit defensible. */
  photoUrls: z.array(z.url().max(500)).max(5).default([]),
  claimedPaise: z.coerce.number().int().min(0).max(100_000_000),
});
export type ReportIssueRequest = z.infer<typeof reportIssueSchema>;
