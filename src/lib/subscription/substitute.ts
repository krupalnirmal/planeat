import type { CandidateProduct } from '@/lib/meal-plan/candidates';

/**
 * B7 — out-of-stock items are auto-substituted at 00:30.
 *
 *   "This decision happens at midnight; waiting for a customer reply means
 *    delaying delivery or dropping the item."
 *
 * The substitute must pass the SAME hard filters as generation: not an
 * allergen, not disliked, in stock, meal-plan-eligible, same category where
 * possible. Those filters are already applied by `buildCandidates`, so this
 * function only has to choose well from what is left.
 *
 * If no acceptable substitute exists, the item is dropped, not charged, and
 * the customer is told (B7). Silently shipping something else, or silently
 * shipping nothing, are both worse than a short delivery with an explanation.
 */

export interface SubstituteInput {
  /** The vegetable that went out of stock. May be absent from candidates. */
  original: {
    id: string;
    categorySlug: string;
    tags: string[];
  };
  /** Already filtered for allergens, dislikes and diet. */
  candidates: readonly CandidateProduct[];
  /** Products already on today's order — never suggest a duplicate. */
  excludeProductIds: readonly string[];
}

export interface SubstituteChoice {
  product: CandidateProduct;
  /** Why this one, for the 08:00 notification and the admin log. */
  matchQuality: 'SAME_CATEGORY_SIMILAR' | 'SAME_CATEGORY' | 'ANY_AVAILABLE';
}

/**
 * Deterministic on purpose: two runs of the cron for the same date must pick
 * the same substitute, or a retry would change what the customer is charged
 * for.
 */
export function findSubstitute(input: SubstituteInput): SubstituteChoice | null {
  const excluded = new Set([...input.excludeProductIds, input.original.id]);
  const wanted = new Set(input.original.tags.map((tag) => tag.toLowerCase()));

  const eligible = input.candidates.filter(
    (candidate) => !excluded.has(candidate.id) && (candidate.variant?.stockQty ?? 0) > 0,
  );

  if (eligible.length === 0) return null;

  const scored = eligible
    .map((candidate) => {
      const sameCategory = candidate.categorySlug === input.original.categorySlug;
      const sharedTags = candidate.tags.filter((tag) => wanted.has(tag.toLowerCase())).length;

      // B7 — "same category where possible". A gourd for a gourd beats a
      // fruit for a gourd, whatever the tag overlap says.
      const score = (sameCategory ? 1000 : 0) + sharedTags * 10;

      return { candidate, score, sameCategory, sharedTags };
    })
    .sort((a, b) => b.score - a.score || a.candidate.id.localeCompare(b.candidate.id));

  const best = scored[0];

  return {
    product: best.candidate,
    matchQuality:
      best.sameCategory && best.sharedTags > 0
        ? 'SAME_CATEGORY_SIMILAR'
        : best.sameCategory
          ? 'SAME_CATEGORY'
          : 'ANY_AVAILABLE',
  };
}
