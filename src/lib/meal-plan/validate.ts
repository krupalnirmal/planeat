import type { MealPlanResponse } from '@/lib/ai/schemas/meal-plan';
import { DAYS_OF_WEEK } from '@/lib/ai/schemas/meal-plan';
import type { CandidateProduct } from './candidates';

/**
 * PART 6.3 — the "after" half of the hard constraints.
 *
 *   Zod validation + business rules:
 *     no allergen · no disliked item · all IDs in catalogue
 *     all 7 days × 2 slots filled · no vegetable more than 2× per week
 *
 * The candidate list was already stripped of allergens and dislikes before the
 * call, so an id outside that list is exactly what an allergen violation looks
 * like from here. That is why "unknown id" is treated as a safety failure and
 * not a formatting nit.
 *
 * Errors come back as plain sentences because they are fed verbatim into the
 * single retry (R6). "Invalid response" produces the same invalid response
 * again; "MONDAY is missing an EVENING meal" does not.
 */

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

const MAX_USES_PER_WEEK = 2;

export function validateMealPlanResponse(
  response: MealPlanResponse,
  candidates: readonly CandidateProduct[],
): ValidationResult {
  const errors: string[] = [];
  const allowed = new Map(candidates.map((candidate) => [candidate.id, candidate]));

  // ── All seven days, exactly once each.
  const seenDays = new Set<string>();
  for (const day of response.plan) {
    if (seenDays.has(day.dayOfWeek)) {
      errors.push(`${day.dayOfWeek} appears more than once.`);
    }
    seenDays.add(day.dayOfWeek);
  }
  for (const day of DAYS_OF_WEEK) {
    if (!seenDays.has(day)) errors.push(`${day} is missing from the plan.`);
  }

  // ── Two slots per day, one MORNING and one EVENING.
  for (const day of response.plan) {
    const slots = day.meals.map((meal) => meal.slot);
    if (!slots.includes('MORNING')) errors.push(`${day.dayOfWeek} is missing a MORNING meal.`);
    if (!slots.includes('EVENING')) errors.push(`${day.dayOfWeek} is missing an EVENING meal.`);
    if (new Set(slots).size !== slots.length) {
      errors.push(`${day.dayOfWeek} has two meals in the same slot.`);
    }
  }

  // ── Every id must be one we offered.
  //
  // S4 — the candidate list had allergens and dislikes removed, so an id from
  // outside it is a potential allergen. This check is the hard block.
  const usage = new Map<string, number>();

  for (const day of response.plan) {
    for (const meal of day.meals) {
      const candidate = allowed.get(meal.productId);

      if (!candidate) {
        errors.push(
          `Product id "${meal.productId}" on ${day.dayOfWeek} ${meal.slot} is not in the catalogue you were given.`,
        );
        continue;
      }

      usage.set(meal.productId, (usage.get(meal.productId) ?? 0) + 1);
    }
  }

  // ── No vegetable more than twice a week.
  for (const [productId, count] of usage) {
    if (count > MAX_USES_PER_WEEK) {
      const name = allowed.get(productId)?.nameEn ?? productId;
      errors.push(`"${name}" is used ${count} times; the maximum is ${MAX_USES_PER_WEEK}.`);
    }
  }

  // ── Rationale hygiene (S1).
  //
  // The prompt forbids these words. Checking here means a model that ignores
  // the instruction cannot put "this will cure your diabetes" on a customer's
  // screen.
  const banned = /\b(prescri\w*|treatment|treat|cure[sd]?|curing|medical advice|diagnos\w*)\b/i;
  for (const day of response.plan) {
    for (const meal of day.meals) {
      if (banned.test(meal.rationale)) {
        errors.push(
          `The rationale on ${day.dayOfWeek} ${meal.slot} uses medical wording that is not allowed. Describe what the vegetable offers instead.`,
        );
      }
    }
  }
  if (banned.test(response.overallNote)) {
    errors.push('The overall note uses medical wording that is not allowed.');
  }

  return { ok: errors.length === 0, errors };
}

/**
 * A last, paranoid re-check straight before persisting.
 *
 * `validateMealPlanResponse` already covers this, but S4 says a plan
 * containing a declared allergen must NEVER be persisted or displayed — and
 * "never" is worth two checks on different sides of the code that assembles
 * the rows. This one runs on the final product ids, whatever produced them,
 * including the rule-based fallback.
 */
export function assertNoForbiddenProducts(
  productIds: readonly string[],
  candidates: readonly CandidateProduct[],
): void {
  const allowed = new Set(candidates.map((candidate) => candidate.id));
  const offending = productIds.filter((id) => !allowed.has(id));

  if (offending.length > 0) {
    throw new Error(
      `Refusing to persist a meal plan containing products outside the safe candidate list: ${offending.join(', ')}`,
    );
  }
}
