import type { MealPlanOptionsResponse } from '@/lib/ai/schemas/meal-plan-options';
import type { CandidateProduct } from './candidates';
import { GOAL_AFFINITIES, CONDITION_AFFINITIES, hash, scoreCandidate, NotEnoughCandidatesError } from './fallback';
import { PLAN_CATEGORIES, type PlanCategoryCode } from './plan-categories';

/**
 * The deterministic rule-based fallback for options generation — sibling of
 * `fallback.ts`, reusing its goal/condition tag-affinity scoring so a
 * customer regenerating without AI available gets the same kind of
 * "sensible, explainable rotation" the single-pick fallback already gives,
 * just as 2-3 ranked options per category instead of one resolved pick.
 */

/** Every category needs at least this many real candidates to offer choices from. */
export const MINIMUM_CANDIDATES_PER_CATEGORY = 2;
const OPTIONS_PER_CATEGORY = 3;

export interface FallbackOptionsInput {
  candidatesByCategory: Record<PlanCategoryCode, CandidateProduct[]>;
  goal: string;
  conditions: readonly string[];
  /** Makes the rotation stable per customer without being random. */
  seed: string;
}

export function buildFallbackOptions(input: FallbackOptionsInput): MealPlanOptionsResponse {
  for (const category of PLAN_CATEGORIES) {
    const count = input.candidatesByCategory[category].length;
    if (count < MINIMUM_CANDIDATES_PER_CATEGORY) {
      throw new NotEnoughCandidatesError(count);
    }
  }

  const wanted = new Set<string>(GOAL_AFFINITIES[input.goal] ?? GOAL_AFFINITIES.GENERAL_HEALTH);
  for (const condition of input.conditions) {
    for (const tag of CONDITION_AFFINITIES[condition.toUpperCase()] ?? []) wanted.add(tag);
  }

  const seed = hash(input.seed);

  const rankedByCategory = Object.fromEntries(
    PLAN_CATEGORIES.map((category) => {
      const ranked = [...input.candidatesByCategory[category]]
        .map((candidate) => ({ candidate, score: scoreCandidate(candidate, wanted, seed) }))
        .sort((a, b) => b.score - a.score || a.candidate.id.localeCompare(b.candidate.id))
        .map((entry) => entry.candidate);

      // Leafy vegetables wilt, so they lead the rotation window early in
      // the week (mirrors fallback.ts's ordering rule).
      const leafy = ranked.filter((candidate) => candidate.tags.includes('leafy'));
      const rest = ranked.filter((candidate) => !candidate.tags.includes('leafy'));
      return [category, [...leafy, ...rest]] as const;
    }),
  ) as Record<PlanCategoryCode, CandidateProduct[]>;

  const days: MealPlanOptionsResponse['days'] = [];

  for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
    const categories = PLAN_CATEGORIES.map((category) => {
      const ranked = rankedByCategory[category];
      const size = Math.min(OPTIONS_PER_CATEGORY, ranked.length);
      // A rotating window so the week doesn't offer the exact same top-N
      // every day (the AI prompt asks for the same variety).
      const offset = dayIndex % ranked.length;
      const optionIds = Array.from({ length: size }, (_, i) => ranked[(offset + i) % ranked.length].id);

      return { category, optionIds };
    });

    days.push({ dayNumber: (dayIndex + 1) as 1 | 2 | 3 | 4 | 5 | 6 | 7, categories });
  }

  return {
    days,
    overallNote:
      'A week of seasonal, varied options across breakfast, fruits, dairy, everyday staples and vegetables.',
    // The safety layer sets the real flag; the fallback never lowers it.
    flaggedForReview: false,
    flagReason: null,
  };
}
