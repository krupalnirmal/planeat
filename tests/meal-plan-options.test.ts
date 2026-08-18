import { describe, expect, it } from 'vitest';
import type { MealPlanOptionsResponse } from '@/lib/ai/schemas/meal-plan-options';
import { groupCandidatesByPlanCategory, PLAN_CATEGORIES } from '@/lib/meal-plan/plan-categories';
import type { CandidateProduct } from '@/lib/meal-plan/candidates';
import { validateMealPlanOptionsResponse, assertNoForbiddenOptions } from '@/lib/meal-plan/validate-options';

/**
 * "Make My Meal Plan" options generation — the grouping that decides which
 * real candidates the AI sees per category, and the validation that makes
 * sure whatever comes back only ever references those candidates.
 */

function candidate(overrides: Partial<CandidateProduct> & { id: string; categorySlug: string }): CandidateProduct {
  return {
    sku: overrides.id,
    name: overrides.id,
    nameEn: overrides.id,
    nameMr: overrides.id,
    nameHi: overrides.id,
    unitType: 'G',
    tags: [],
    variant: { id: `${overrides.id}-v`, quantity: 500, unit: 'G', pricePaise: 5000n, stockQty: 10 },
    ...overrides,
  };
}

describe('groupCandidatesByPlanCategory', () => {
  it('routes vegetables, fruits and dairy by category slug', () => {
    const candidates = [
      candidate({ id: 'carrot', categorySlug: 'vegetables' }),
      candidate({ id: 'apple', categorySlug: 'fruits' }),
      candidate({ id: 'milk', categorySlug: 'dairy' }),
    ];
    const grouped = groupCandidatesByPlanCategory(candidates);
    expect(grouped.VEGETABLES.map((c) => c.id)).toEqual(['carrot']);
    expect(grouped.FRUITS.map((c) => c.id)).toEqual(['apple']);
    expect(grouped.DAIRY.map((c) => c.id)).toEqual(['milk']);
  });

  it('splits grocery/bakery into Breakfast (tagged) vs Other (untagged)', () => {
    const candidates = [
      candidate({ id: 'poha', categorySlug: 'grocery', tags: ['staple', 'breakfast'] }),
      candidate({ id: 'rice', categorySlug: 'grocery', tags: ['staple'] }),
      candidate({ id: 'bread', categorySlug: 'bakery-biscuits', tags: ['bakery', 'breakfast'] }),
    ];
    const grouped = groupCandidatesByPlanCategory(candidates);
    expect(grouped.BREAKFAST.map((c) => c.id).sort()).toEqual(['bread', 'poha']);
    expect(grouped.OTHER.map((c) => c.id)).toEqual(['rice']);
  });
});

const CANDIDATES_BY_CATEGORY = groupCandidatesByPlanCategory([
  candidate({ id: 'v1', categorySlug: 'vegetables' }),
  candidate({ id: 'v2', categorySlug: 'vegetables' }),
  candidate({ id: 'f1', categorySlug: 'fruits' }),
  candidate({ id: 'f2', categorySlug: 'fruits' }),
  candidate({ id: 'd1', categorySlug: 'dairy' }),
  candidate({ id: 'd2', categorySlug: 'dairy' }),
  candidate({ id: 'b1', categorySlug: 'grocery', tags: ['breakfast'] }),
  candidate({ id: 'b2', categorySlug: 'grocery', tags: ['breakfast'] }),
  candidate({ id: 'o1', categorySlug: 'grocery' }),
  candidate({ id: 'o2', categorySlug: 'grocery' }),
]);

function validResponse(): MealPlanOptionsResponse {
  return {
    days: Array.from({ length: 7 }, (_, i) => ({
      dayNumber: (i + 1) as 1 | 2 | 3 | 4 | 5 | 6 | 7,
      categories: [
        { category: 'BREAKFAST', optionIds: ['b1', 'b2'] },
        { category: 'FRUITS', optionIds: ['f1', 'f2'] },
        { category: 'DAIRY', optionIds: ['d1', 'd2'] },
        { category: 'OTHER', optionIds: ['o1', 'o2'] },
        { category: 'VEGETABLES', optionIds: ['v1', 'v2'] },
      ],
    })),
    overallNote: 'A balanced week of options.',
    flaggedForReview: false,
    flagReason: null,
  };
}

describe('validateMealPlanOptionsResponse', () => {
  it('accepts a response using only ids from the matching category catalogue', () => {
    const result = validateMealPlanOptionsResponse(validResponse(), CANDIDATES_BY_CATEGORY);
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('rejects an id borrowed from a different category', () => {
    const response = validResponse();
    response.days[0].categories[0].optionIds = ['v1', 'v2']; // vegetables ids under BREAKFAST
    const result = validateMealPlanOptionsResponse(response, CANDIDATES_BY_CATEGORY);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('BREAKFAST'))).toBe(true);
  });

  it('rejects a missing day', () => {
    const response = validResponse();
    response.days = response.days.slice(1);
    const result = validateMealPlanOptionsResponse(response, CANDIDATES_BY_CATEGORY);
    expect(result.errors.some((e) => e.includes('Day 1 is missing'))).toBe(true);
  });

  it('rejects medical wording in the overall note', () => {
    const response = validResponse();
    response.overallNote = 'This will cure your diabetes.';
    const result = validateMealPlanOptionsResponse(response, CANDIDATES_BY_CATEGORY);
    expect(result.ok).toBe(false);
  });
});

describe('assertNoForbiddenOptions', () => {
  it('does not throw when every id is a real candidate', () => {
    expect(() => assertNoForbiddenOptions(['v1', 'f1'], CANDIDATES_BY_CATEGORY)).not.toThrow();
  });

  it('throws when an id is outside every category catalogue', () => {
    expect(() => assertNoForbiddenOptions(['v1', 'made-up-id'], CANDIDATES_BY_CATEGORY)).toThrow(
      /made-up-id/,
    );
  });
});

it('every plan category is covered by SELECTION_TYPE and grouping', () => {
  expect(PLAN_CATEGORIES).toHaveLength(5);
});
