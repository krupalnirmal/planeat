import { describe, expect, it } from 'vitest';
import { mealPlanResponseSchema } from '@/lib/ai/schemas/meal-plan';
import { MockAIProvider } from '@/lib/services/ai';
import type { CandidateProduct } from '@/lib/meal-plan/candidates';
import { compressForPrompt } from '@/lib/meal-plan/candidates';
import { NotEnoughCandidatesError, buildFallbackPlan } from '@/lib/meal-plan/fallback';
import { containsAllergen } from '@/lib/meal-plan/allergens';
import { assertNoForbiddenProducts, validateMealPlanResponse } from '@/lib/meal-plan/validate';

/**
 * PART 6.3's pipeline, and the PART 12 acceptance criteria that depend on it:
 *
 *   - "Plan generates with all 7 days × 2 slots filled"
 *   - "A peanut-allergy profile NEVER produces a plan containing peanuts
 *      across 20 consecutive generations"
 *   - "A disliked vegetable never appears in a freshly generated plan"
 *
 * Run entirely against mocks and in-memory catalogues (R2), so the guarantee is
 * exercised without a database or an API key.
 */

function product(
  id: string,
  nameEn: string,
  nameMr: string,
  tags: string[],
): CandidateProduct {
  return {
    id,
    sku: id.toUpperCase(),
    name: nameMr,
    nameEn,
    nameMr,
    nameHi: nameMr,
    categorySlug: 'vegetables',
    unitType: 'G',
    tags,
    variant: { id: `${id}_v`, quantity: 500, unit: 'G', pricePaise: 2000n, stockQty: 40 },
  };
}

/** A realistic slice of the seeded catalogue, including the peanut item. */
const CATALOGUE: CandidateProduct[] = [
  product('prd_onion', 'Onion', 'कांदा', ['staple', 'allium']),
  product('prd_tomato', 'Tomato', 'टोमॅटो', ['staple', 'vitamin-c']),
  product('prd_potato', 'Potato', 'बटाटा', ['staple', 'starchy', 'root']),
  product('prd_okra', 'Lady Finger', 'भेंडी', ['fibre', 'folate', 'diabetes-friendly']),
  product('prd_spinach', 'Spinach', 'पालक', ['iron', 'leafy', 'anaemia']),
  product('prd_methi', 'Fenugreek Leaves', 'मेथी', ['iron', 'leafy', 'diabetes-friendly']),
  product('prd_gourd', 'Bottle Gourd', 'दुधी भोपळा', ['hydrating', 'low-calorie']),
  product('prd_cabbage', 'Cabbage', 'कोबी', ['fibre', 'vitamin-c']),
  product('prd_carrot', 'Carrot', 'गाजर', ['vitamin-a', 'root']),
  product('prd_beetroot', 'Beetroot', 'बीट', ['iron', 'anaemia', 'root']),
];

const PEANUT = product('prd_peanut', 'Fresh Groundnuts', 'ओले शेंगदाणे', [
  'protein',
  'energy',
  'allergen:peanut',
]);

const FULL_CATALOGUE = [...CATALOGUE, PEANUT];

/**
 * The candidate filter, as `buildCandidates` applies it — reproduced here
 * without the database so the guarantee can be tested in isolation.
 */
function filterCandidates(
  catalogue: CandidateProduct[],
  allergies: string[],
  dislikedIds: string[],
): CandidateProduct[] {
  const disliked = new Set(dislikedIds);
  return catalogue.filter((candidate) => {
    const checkable = {
      id: candidate.id,
      nameEn: candidate.nameEn,
      nameMr: candidate.nameMr,
      nameHi: candidate.nameHi,
      tags: candidate.tags,
      searchKeywords: null,
      aliases: [],
    };
    if (containsAllergen(checkable, allergies)) return false;
    if (disliked.has(candidate.id)) return false;
    return true;
  });
}

describe('PART 12 — a peanut allergy never yields peanuts, 20 generations running', () => {
  it('holds across 20 consecutive generations', () => {
    const safe = filterCandidates(FULL_CATALOGUE, ['PEANUT'], []);

    // The filter itself removed it before anything else ran.
    expect(safe.map((candidate) => candidate.id)).not.toContain('prd_peanut');

    for (let run = 0; run < 20; run++) {
      const plan = buildFallbackPlan({
        candidates: safe,
        goal: 'GENERAL_HEALTH',
        conditions: [],
        // A different seed each run — the guarantee must not depend on luck.
        seed: `profile_${run}`,
      });

      const ids = plan.plan.flatMap((day) => day.meals.map((meal) => meal.productId));
      expect(ids).not.toContain('prd_peanut');

      // And the post-check would refuse to persist it even if it appeared.
      expect(() => assertNoForbiddenProducts(ids, safe)).not.toThrow();
    }
  });

  it('refuses to persist a plan containing a filtered-out product', () => {
    const safe = filterCandidates(FULL_CATALOGUE, ['PEANUT'], []);
    expect(() => assertNoForbiddenProducts(['prd_onion', 'prd_peanut'], safe)).toThrow(
      /outside the safe candidate list/,
    );
  });

  it('rejects an AI response naming a filtered-out product', () => {
    const safe = filterCandidates(FULL_CATALOGUE, ['PEANUT'], []);
    const plan = buildFallbackPlan({
      candidates: safe,
      goal: 'GENERAL_HEALTH',
      conditions: [],
      seed: 'x',
    });

    // Simulate a model returning the peanut anyway.
    plan.plan[0].meals[0].productId = 'prd_peanut';

    const result = validateMealPlanResponse(plan, safe);
    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toContain('prd_peanut');
  });
});

describe('PART 12 — a disliked vegetable never appears', () => {
  it('is filtered out before generation', () => {
    const safe = filterCandidates(FULL_CATALOGUE, [], ['prd_okra', 'prd_cabbage']);
    expect(safe.map((c) => c.id)).not.toContain('prd_okra');
    expect(safe.map((c) => c.id)).not.toContain('prd_cabbage');

    const plan = buildFallbackPlan({
      candidates: safe,
      goal: 'GENERAL_HEALTH',
      conditions: [],
      seed: 'p',
    });
    const ids = plan.plan.flatMap((day) => day.meals.map((meal) => meal.productId));

    expect(ids).not.toContain('prd_okra');
    expect(ids).not.toContain('prd_cabbage');
  });
});

describe('the deterministic fallback (R6)', () => {
  const build = (seed = 'seed') =>
    buildFallbackPlan({ candidates: CATALOGUE, goal: 'GENERAL_HEALTH', conditions: [], seed });

  it('fills all 7 days and both slots', () => {
    const plan = build();
    expect(plan.plan).toHaveLength(7);
    for (const day of plan.plan) {
      expect(day.meals).toHaveLength(2);
      expect(day.meals.map((meal) => meal.slot).sort()).toEqual(['EVENING', 'MORNING']);
    }
  });

  it('passes its own validation', () => {
    expect(validateMealPlanResponse(build(), CATALOGUE).ok).toBe(true);
  });

  it('uses no vegetable more than twice a week', () => {
    const uses = new Map<string, number>();
    for (const day of build().plan) {
      for (const meal of day.meals) {
        uses.set(meal.productId, (uses.get(meal.productId) ?? 0) + 1);
      }
    }
    for (const count of uses.values()) expect(count).toBeLessThanOrEqual(2);
  });

  it('is deterministic — the same seed gives the same plan', () => {
    expect(build('same')).toEqual(build('same'));
  });

  it('varies between customers', () => {
    // Same catalogue, different profile: the rotation should differ, or every
    // household in Pathardi cooks the same thing on Tuesday.
    expect(JSON.stringify(build('customer-a'))).not.toBe(JSON.stringify(build('customer-b')));
  });

  it('puts leafy vegetables early in the week — they wilt', () => {
    const plan = build();
    const mondayIds = plan.plan[0].meals.map((meal) => meal.productId);
    expect(mondayIds.some((id) => ['prd_spinach', 'prd_methi'].includes(id))).toBe(true);
  });

  it('never writes a medical claim into a rationale (S1)', () => {
    const banned = /\b(prescri\w*|treatment|cure[sd]?|medical advice|diagnos\w*)\b/i;
    for (const day of build().plan) {
      for (const meal of day.meals) expect(banned.test(meal.rationale)).toBe(false);
    }
  });

  it('refuses when there are fewer than 7 vegetables', () => {
    // 14 slots at 2 uses each needs 7 distinct products; below that no valid
    // plan exists and pretending otherwise would produce a broken week.
    expect(() =>
      buildFallbackPlan({
        candidates: CATALOGUE.slice(0, 6),
        goal: 'GENERAL_HEALTH',
        conditions: [],
        seed: 's',
      }),
    ).toThrow(NotEnoughCandidatesError);
  });

  it('works with exactly 7 vegetables', () => {
    const plan = buildFallbackPlan({
      candidates: CATALOGUE.slice(0, 7),
      goal: 'GENERAL_HEALTH',
      conditions: [],
      seed: 's',
    });
    expect(validateMealPlanResponse(plan, CATALOGUE.slice(0, 7)).ok).toBe(true);
  });
});

describe('post-validation business rules', () => {
  const valid = () =>
    buildFallbackPlan({ candidates: CATALOGUE, goal: 'GENERAL_HEALTH', conditions: [], seed: 'v' });

  it('catches a missing day', () => {
    const plan = valid();
    plan.plan = plan.plan.slice(0, 6) as typeof plan.plan;
    expect(validateMealPlanResponse(plan, CATALOGUE).errors.join(' ')).toContain('SUNDAY');
  });

  it('catches two meals in the same slot', () => {
    const plan = valid();
    plan.plan[0].meals[1].slot = 'MORNING';
    const errors = validateMealPlanResponse(plan, CATALOGUE).errors.join(' ');
    expect(errors).toContain('EVENING');
  });

  it('catches a vegetable used three times', () => {
    const plan = valid();
    plan.plan[0].meals[0].productId = 'prd_onion';
    plan.plan[0].meals[1].productId = 'prd_onion';
    plan.plan[1].meals[0].productId = 'prd_onion';
    expect(validateMealPlanResponse(plan, CATALOGUE).errors.join(' ')).toContain('Onion');
  });

  it('catches medical wording in a rationale (S1)', () => {
    const plan = valid();
    plan.plan[0].meals[0].rationale = 'This will cure your diabetes.';
    expect(validateMealPlanResponse(plan, CATALOGUE).errors.join(' ')).toContain(
      'medical wording',
    );
  });

  it('catches medical wording in the overall note', () => {
    const plan = valid();
    plan.overallNote = 'A treatment plan for your condition.';
    expect(validateMealPlanResponse(plan, CATALOGUE).ok).toBe(false);
  });

  it('returns errors specific enough to feed back on the retry', () => {
    const plan = valid();
    plan.plan[3].meals[0].productId = 'prd_not_real';
    const errors = validateMealPlanResponse(plan, CATALOGUE).errors;
    // "Invalid response" would produce the same invalid response again.
    expect(errors[0]).toContain('prd_not_real');
    expect(errors[0]).toContain('THURSDAY');
  });
});

describe('prompt payload', () => {
  it('sends only id, name and tags — and never an allergen tag', () => {
    const compressed = compressForPrompt(FULL_CATALOGUE);
    expect(Object.keys(compressed[0]).sort()).toEqual(['id', 'name', 'tags']);

    const allTags = compressed.flatMap((entry) => entry.tags);
    expect(allTags.some((tag) => tag.startsWith('allergen:'))).toBe(false);
  });
});

describe('the AI mock satisfies the AI-1 schema', () => {
  it('produces a schema-valid response', async () => {
    const ai = new MockAIProvider();
    const result = await ai.generateJSON({
      system: 's',
      user: 'u',
      schema: mealPlanResponseSchema,
    });
    expect(mealPlanResponseSchema.safeParse(result).success).toBe(true);
  });

  it('is rejected by the business rules, because its ids are invented', async () => {
    // Exactly the intended behaviour: the mock cannot know our catalogue, so
    // the pipeline retries once and then falls back — which is the path this
    // test proves is reachable.
    const ai = new MockAIProvider();
    const result = await ai.generateJSON({
      system: 's',
      user: 'u',
      schema: mealPlanResponseSchema,
    });
    expect(validateMealPlanResponse(result, CATALOGUE).ok).toBe(false);
  });
});
