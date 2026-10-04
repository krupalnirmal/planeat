import { z } from 'zod';
import { cuidSchema } from './common';

/** The vendor PWA's own inputs. */

export const submitSupplySchema = z.object({
  variantId: cuidSchema,
  quantity: z.coerce.number().int().min(1).max(100_000),
  costPricePaise: z.coerce.number().int().min(1).max(100_000_000),
});
export type SubmitSupplyRequest = z.infer<typeof submitSupplySchema>;
