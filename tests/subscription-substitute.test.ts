import { describe, expect, it } from 'vitest';
import type { CandidateProduct } from '@/lib/meal-plan/candidates';
import { findSubstitute } from '@/lib/subscription/substitute';

/**
 * B7 — out-of-stock items are auto-substituted at 00:30.
 *
 * PART 12 — "An out-of-stock item auto-substitutes and notifies, never
 * silently vanishes."
 *
 * The candidate list handed in here has already been through the same hard
 * filters as generation (allergens, dislikes, diet), so these tests are about
 * choosing WELL from what is safe — and about refusing when nothing is.
 */

function product(
  id: string,
  nameEn: string,
  categorySlug: string,
  tags: string[],
  stockQty = 40,
): CandidateProduct {
  return {
    id,
    sku: id.toUpperCase(),
    name: nameEn,
    nameEn,
    nameMr: nameEn,
    nameHi: nameEn,
    categorySlug,
    unitType: 'G',
    tags,
    variant: { id: `${id}_v`, quantity: 500, unit: 'G', pricePaise: 2_000n, stockQty },
  };
}

const BOTTLE_GOURD = { id: 'prd_dudhi', categorySlug: 'vegetables', tags: ['hydrating', 'low-calorie'] };

const CANDIDATES: CandidateProduct[] = [
  product('prd_ridge', 'Ridge Gourd', 'vegetables', ['hydrating', 'low-calorie']),
  product('prd_cabbage', 'Cabbage', 'vegetables', ['fibre', 'vitamin-c']),
  product('prd_apple', 'Apple', 'fruits', ['hydrating', 'low-calorie', 'fibre']),
];

describe('B7 — choosing a substitute', () => {
  it('prefers the same category even when a different one shares more tags', () => {
    // The apple shares all three tags; the ridge gourd shares two. A gourd for
    // a gourd is still the right answer — "same category where possible".
    const choice = findSubstitute({
      original: BOTTLE_GOURD,
      candidates: CANDIDATES,
      excludeProductIds: [],
    });

    expect(choice?.product.id).toBe('prd_ridge');
    expect(choice?.matchQuality).toBe('SAME_CATEGORY_SIMILAR');
  });

  it('falls back to another category when nothing in the same one is left', () => {
    const choice = findSubstitute({
      original: BOTTLE_GOURD,
      candidates: [CANDIDATES[2]],
      excludeProductIds: [],
    });

    expect(choice?.product.id).toBe('prd_apple');
    expect(choice?.matchQuality).toBe('ANY_AVAILABLE');
  });

  it('reports a weaker match when the category matches but nothing else does', () => {
    const choice = findSubstitute({
      original: BOTTLE_GOURD,
      candidates: [CANDIDATES[1]],
      excludeProductIds: [],
    });

    expect(choice?.product.id).toBe('prd_cabbage');
    expect(choice?.matchQuality).toBe('SAME_CATEGORY');
  });

  it('never suggests the vegetable that went out of stock', () => {
    const withOriginal = [
      ...CANDIDATES,
      product('prd_dudhi', 'Bottle Gourd', 'vegetables', ['hydrating', 'low-calorie']),
    ];
    const choice = findSubstitute({
      original: BOTTLE_GOURD,
      candidates: withOriginal,
      excludeProductIds: [],
    });
    expect(choice?.product.id).not.toBe('prd_dudhi');
  });

  it('never duplicates something already on the same order', () => {
    // The morning meal already has the ridge gourd; the evening substitute
    // must be something else, or the customer gets two bags of the same thing.
    const choice = findSubstitute({
      original: BOTTLE_GOURD,
      candidates: CANDIDATES,
      excludeProductIds: ['prd_ridge'],
    });
    expect(choice?.product.id).not.toBe('prd_ridge');
  });

  it('ignores candidates that are themselves out of stock', () => {
    const choice = findSubstitute({
      original: BOTTLE_GOURD,
      candidates: [product('prd_ridge', 'Ridge Gourd', 'vegetables', ['hydrating'], 0)],
      excludeProductIds: [],
    });
    expect(choice).toBeNull();
  });

  it('returns null when nothing is available — the item is dropped, not faked', () => {
    // B7 — "If no acceptable substitute exists, drop the item, do not charge,
    // and notify." Silently shipping something else would be worse.
    expect(
      findSubstitute({ original: BOTTLE_GOURD, candidates: [], excludeProductIds: [] }),
    ).toBeNull();
  });

  it('is deterministic — two cron runs pick the same substitute', () => {
    // A retry that changed the substitute would change what the customer is
    // charged for.
    const first = findSubstitute({
      original: BOTTLE_GOURD,
      candidates: CANDIDATES,
      excludeProductIds: [],
    });
    const second = findSubstitute({
      original: BOTTLE_GOURD,
      candidates: [...CANDIDATES].reverse(),
      excludeProductIds: [],
    });
    expect(first?.product.id).toBe(second?.product.id);
  });
});
