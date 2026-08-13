import { z } from 'zod';
import { cuidSchema } from './common';

/** M6 — skip, pause, resume, cancel, and change slot or address. */

export const skipDaySchema = z.object({
  date: z.iso.date(),
  /** Undo a skip while the cutoff still allows it. */
  undo: z.boolean().default(false),
});
export type SkipDayInput = z.infer<typeof skipDaySchema>;

export const pauseSchema = z.object({
  fromDate: z.iso.date(),
  toDate: z.iso.date(),
});
export type PauseInput = z.infer<typeof pauseSchema>;

export const updateSubscriptionSchema = z
  .object({
    addressId: cuidSchema.optional(),
    // B1 — one delivery per day, in the single morning slot. The enum has one
    // member on purpose: a second delivery would double rider cost for no
    // customer benefit.
    deliverySlot: z.enum(['SUBSCRIPTION_0630_0900']).optional(),
  })
  .refine((value) => value.addressId !== undefined || value.deliverySlot !== undefined, {
    message: 'Nothing to change',
  });
export type UpdateSubscriptionInput = z.infer<typeof updateSubscriptionSchema>;

export const scheduleQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(31).default(7),
});

/** Admin-triggered rerun of the 00:30 job (M6's reliability requirement). */
export const regenerateSchema = z.object({
  date: z.iso.date().optional(),
});
