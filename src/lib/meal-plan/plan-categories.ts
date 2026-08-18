import type { CandidateProduct } from './candidates';

/**
 * The 5 fixed day/category slots "Make My Meal Plan" generates options into
 * (doc §3/§9). Grouping and selection type are decided here, in code — same
 * discipline as B4 quantity and the fixed slot mapping in `finalize.ts`,
 * never left for the AI to decide per plan.
 */

export const PLAN_CATEGORIES = ['BREAKFAST', 'FRUITS', 'DAIRY', 'OTHER', 'VEGETABLES'] as const;
export type PlanCategoryCode = (typeof PLAN_CATEGORIES)[number];

/**
 * Vegetables is the only multi-select category (doc §10/§11 — several
 * vegetables per day, each with its own quantity). Everything else is one
 * pick per day: a household has one breakfast, not three.
 */
export const SELECTION_TYPE: Record<PlanCategoryCode, 'SINGLE' | 'MULTIPLE'> = {
  BREAKFAST: 'SINGLE',
  FRUITS: 'SINGLE',
  DAIRY: 'SINGLE',
  OTHER: 'SINGLE',
  VEGETABLES: 'MULTIPLE',
};

/**
 * Which of the 5 categories actually become real, delivered `MealPlanItem`
 * rows on `finalize` — vs. staying informational-only in the draft. All 5
 * are deliverable per the client's confirmed scope (session 2026-08-18);
 * kept as a named export rather than inlined so the "what gets delivered"
 * decision reads as one place, not scattered through finalize.ts.
 */
export const DELIVERABLE_CATEGORIES: readonly PlanCategoryCode[] = PLAN_CATEGORIES;

/**
 * Groups an already safety-filtered candidate list (`buildCandidates()`,
 * allergens/dislikes/dietary preference already stripped) into the 5 plan
 * categories. One extra pass, no extra query — `buildCandidates` already
 * pulls every meal-plan-eligible product regardless of category.
 *
 * Breakfast vs. Other within Grocery/Bakery & Biscuits is a `tags` split:
 * `breakfast`-tagged items (poha, rava, bread, cornflakes) are Breakfast;
 * everything else in those two categories (rice, oil, dal, atta) is Other.
 */
export function groupCandidatesByPlanCategory(
  candidates: readonly CandidateProduct[],
): Record<PlanCategoryCode, CandidateProduct[]> {
  const grouped: Record<PlanCategoryCode, CandidateProduct[]> = {
    BREAKFAST: [],
    FRUITS: [],
    DAIRY: [],
    OTHER: [],
    VEGETABLES: [],
  };

  for (const candidate of candidates) {
    const isBreakfastTagged = candidate.tags.includes('breakfast');

    if (candidate.categorySlug === 'vegetables') {
      grouped.VEGETABLES.push(candidate);
    } else if (candidate.categorySlug === 'fruits') {
      grouped.FRUITS.push(candidate);
    } else if (candidate.categorySlug === 'dairy') {
      grouped.DAIRY.push(candidate);
    } else if (isBreakfastTagged) {
      grouped.BREAKFAST.push(candidate);
    } else {
      grouped.OTHER.push(candidate);
    }
  }

  return grouped;
}
