import { z } from 'zod';
import { PLAN_CATEGORIES } from '@/lib/meal-plan/plan-categories';

/**
 * The AI-1b output schema for "Make My Meal Plan" (options generation).
 *
 * The sibling of `meal-plan.ts`'s single-pick schema, generalised to N
 * candidate ids per category per day instead of one resolved productId per
 * slot — the customer picks afterwards (`selectMealPlanDraftOption`), the
 * model never does. Same absolute rule as the single-pick version: quantity
 * is NOT here. B4 computes it in code (`generate-options.ts`), never the AI.
 *
 * A week (7 days), not the customer's chosen plan duration — `MealPlanDay`
 * has always been a repeating 7-day template (`dayOfWeek` 1-7) that a longer
 * subscription cycles through, and this draft stage follows the same shape.
 */

export const PLAN_DAY_NUMBERS = [1, 2, 3, 4, 5, 6, 7] as const;

export const mealPlanOptionCategorySchema = z.object({
  category: z.enum(PLAN_CATEGORIES),
  /** 2-3 ranked candidate ids, exactly as given — never a name (R8). */
  optionIds: z.array(z.string().min(1)).min(2).max(3),
});

export const mealPlanOptionsDaySchema = z.object({
  dayNumber: z.union(PLAN_DAY_NUMBERS.map((n) => z.literal(n)) as [z.ZodLiteral<number>, ...z.ZodLiteral<number>[]]),
  categories: z.array(mealPlanOptionCategorySchema).length(PLAN_CATEGORIES.length),
});

export const mealPlanOptionsResponseSchema = z.object({
  days: z.array(mealPlanOptionsDaySchema).length(7),
  overallNote: z.string().min(1).max(400),
  flaggedForReview: z.boolean(),
  flagReason: z.string().max(400).nullable(),
});

export type MealPlanOptionsResponse = z.infer<typeof mealPlanOptionsResponseSchema>;
