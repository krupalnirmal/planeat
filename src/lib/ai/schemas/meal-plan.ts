import { z } from 'zod';

/**
 * PART 6.3 — the AI-1 output schema.
 *
 * R6 — every AI call returns JSON validated with Zod. This is the shape; the
 * *business* rules (ids must exist in the catalogue, no allergen, no more than
 * twice a week) live in `validate.ts`, because a schema can only say "this is
 * a string", not "this string is a product we sell".
 *
 * Note what is NOT here: quantity. B4 computes it in code. A model asked for
 * grams will confidently invent them.
 */

export const DAYS_OF_WEEK = [
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
  'SUNDAY',
] as const;

export type DayOfWeek = (typeof DAYS_OF_WEEK)[number];

/** 1 = Monday … 7 = Sunday, matching `meal_plan_days.day_of_week`. */
export const DAY_NUMBER: Record<DayOfWeek, number> = {
  MONDAY: 1,
  TUESDAY: 2,
  WEDNESDAY: 3,
  THURSDAY: 4,
  FRIDAY: 5,
  SATURDAY: 6,
  SUNDAY: 7,
};

export const MEAL_SLOTS = ['MORNING', 'EVENING'] as const;
export type MealSlotCode = (typeof MEAL_SLOTS)[number];

export const mealPlanItemSchema = z.object({
  slot: z.enum(MEAL_SLOTS),
  productId: z.string().min(1),
  /**
   * One sentence, shown under the item in the week view. Capped because a
   * model given no limit will write a paragraph that does not fit on a 390px
   * screen.
   */
  rationale: z.string().min(1).max(200),
});

export const mealPlanDaySchema = z.object({
  dayOfWeek: z.enum(DAYS_OF_WEEK),
  meals: z.array(mealPlanItemSchema).length(2),
});

export const mealPlanResponseSchema = z.object({
  plan: z.array(mealPlanDaySchema).length(7),
  overallNote: z.string().min(1).max(400),
  /**
   * The model may raise a flag we did not. It can never LOWER one — S3 runs
   * deterministically before the call and the two are OR-ed together.
   */
  flaggedForReview: z.boolean(),
  flagReason: z.string().max(400).nullable(),
});

export type MealPlanResponse = z.infer<typeof mealPlanResponseSchema>;

/** AI-2, swap suggestions. Defined here so P5 inherits the same conventions. */
export const swapSuggestionsSchema = z.object({
  suggestions: z
    .array(
      z.object({
        productId: z.string().min(1),
        reason: z.string().min(1).max(200),
      }),
    )
    .length(3),
});

export type SwapSuggestions = z.infer<typeof swapSuggestionsSchema>;
