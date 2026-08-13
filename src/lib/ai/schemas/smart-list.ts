import { z } from 'zod';

/**
 * AI-4 (transcript → items) and AI-5 (photo → items), PART 6.1.
 *
 * R6 — Zod-validated like every other AI call. Note what the model is NOT
 * asked for: a product id. It has no catalogue here, because matching is done
 * by the alias table and `match.ts`, which are auditable and fixable. The
 * model's only job is to split a sentence into line items — the part it is
 * genuinely better at than a regex.
 */

export const extractedItemSchema = z.object({
  /** The item as the customer said it, in their own script. */
  item: z.string().min(1).max(80),
  /** Null when they did not say a number. Never invented. */
  quantity: z.number().positive().max(1000).nullable(),
  /** As spoken: "किलो", "जुडी", "kg". Null when absent. */
  unit: z.string().max(30).nullable(),
});

export const extractedListSchema = z.object({
  items: z.array(extractedItemSchema).max(60),
});

export type ExtractedList = z.infer<typeof extractedListSchema>;
export type ExtractedItem = z.infer<typeof extractedItemSchema>;
