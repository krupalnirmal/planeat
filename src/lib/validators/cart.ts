import { z } from 'zod';
import { cuidSchema } from './common';

export const addCartItemSchema = z.object({
  variantId: cuidSchema,
  quantity: z.coerce.number().int().min(1).max(20).default(1),
});
export type AddCartItemInput = z.infer<typeof addCartItemSchema>;

export const updateCartItemSchema = z.object({
  /** Zero removes the line — that is what the stepper's minus button does. */
  quantity: z.coerce.number().int().min(0).max(20),
});
export type UpdateCartItemInput = z.infer<typeof updateCartItemSchema>;

/** M3 — the guest's localStorage cart, handed over at login. */
export const mergeCartSchema = z.object({
  lines: z
    .array(
      z.object({
        productId: cuidSchema,
        variantId: cuidSchema,
        quantity: z.coerce.number().int().min(1).max(20),
      }),
    )
    .max(60),
});
export type MergeCartInput = z.infer<typeof mergeCartSchema>;
