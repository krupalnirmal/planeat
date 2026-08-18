import type { MealPlanOptionsResponse } from '@/lib/ai/schemas/meal-plan-options';
import { PLAN_CATEGORIES, type PlanCategoryCode } from './plan-categories';
import type { CandidateProduct } from './candidates';

/**
 * The "after" half of the hard constraints for options generation — sibling
 * of `validate.ts`. An id outside the category's own candidate list is
 * exactly what an allergen violation looks like from here (the candidate
 * list already had allergens/dislikes stripped before the call), so it's
 * treated as a safety failure, not a formatting nit.
 */

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

const banned = /\b(prescri\w*|treatment|treat|cure[sd]?|curing|medical advice|diagnos\w*)\b/i;

export function validateMealPlanOptionsResponse(
  response: MealPlanOptionsResponse,
  candidatesByCategory: Record<PlanCategoryCode, CandidateProduct[]>,
): ValidationResult {
  const errors: string[] = [];
  const allowedByCategory = new Map(
    PLAN_CATEGORIES.map((category) => [
      category,
      new Set(candidatesByCategory[category].map((candidate) => candidate.id)),
    ]),
  );

  // ── All 7 days, exactly once each.
  const seenDays = new Set<number>();
  for (const day of response.days) {
    if (seenDays.has(day.dayNumber)) errors.push(`Day ${day.dayNumber} appears more than once.`);
    seenDays.add(day.dayNumber);
  }
  for (let dayNumber = 1; dayNumber <= 7; dayNumber++) {
    if (!seenDays.has(dayNumber)) errors.push(`Day ${dayNumber} is missing from the plan.`);
  }

  for (const day of response.days) {
    // ── All 5 categories, exactly once, per day.
    const seenCategories = new Set<string>();
    for (const entry of day.categories) {
      if (seenCategories.has(entry.category)) {
        errors.push(`Day ${day.dayNumber} has ${entry.category} more than once.`);
      }
      seenCategories.add(entry.category);
    }
    for (const category of PLAN_CATEGORIES) {
      if (!seenCategories.has(category)) {
        errors.push(`Day ${day.dayNumber} is missing ${category}.`);
      }
    }

    // ── Every option id must belong to that category's own catalogue.
    for (const entry of day.categories) {
      const allowed = allowedByCategory.get(entry.category);
      if (!allowed) continue; // Unreachable — entry.category is schema-validated.

      const unique = new Set(entry.optionIds);
      if (unique.size !== entry.optionIds.length) {
        errors.push(`Day ${day.dayNumber} ${entry.category} has a repeated option id.`);
      }

      for (const id of entry.optionIds) {
        if (!allowed.has(id)) {
          errors.push(
            `Day ${day.dayNumber} ${entry.category} option "${id}" is not in that category's catalogue.`,
          );
        }
      }
    }
  }

  if (banned.test(response.overallNote)) {
    errors.push('The overall note uses medical wording that is not allowed.');
  }

  return { ok: errors.length === 0, errors };
}

/**
 * A last, paranoid re-check straight before persisting draft options —
 * same reasoning as `assertNoForbiddenProducts`: S4 says a plan containing
 * a declared allergen must never be persisted, so this runs again on the
 * final ids regardless of whether the AI or the deterministic fallback
 * produced them.
 */
export function assertNoForbiddenOptions(
  productIds: readonly string[],
  candidatesByCategory: Record<PlanCategoryCode, CandidateProduct[]>,
): void {
  const allowed = new Set(PLAN_CATEGORIES.flatMap((category) => candidatesByCategory[category].map((c) => c.id)));
  const offending = productIds.filter((id) => !allowed.has(id));

  if (offending.length > 0) {
    throw new Error(
      `Refusing to persist meal plan options containing products outside the safe candidate list: ${offending.join(', ')}`,
    );
  }
}
