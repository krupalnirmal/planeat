/**
 * The weekly plan builder's columns — the real, live shop categories that
 * are both meal-plan-eligible and active on the storefront (session
 * 2026-08-30). Replaces the old fixed 5-slot AI taxonomy (Breakfast/
 * Vegetables/Fruits/Dairy/Other, the "Other" bucket especially had no real
 * catalogue category behind it — it was a tag-based subset of Grocery) with
 * whatever the customer can actually see and buy elsewhere in the app.
 *
 * Grocery is `mealPlanEligible` in the seed but its category is switched off
 * storefront-wide (session 2026-08-27), so it's deliberately left out here
 * too — a plan column full of products nobody can otherwise find would be
 * confusing. Ice Cream is neither eligible nor active.
 */
export const PLAN_CATEGORY_SLUGS = ['vegetables', 'fruits', 'dairy', 'bakery-biscuits'] as const;
export type PlanCategorySlug = (typeof PLAN_CATEGORY_SLUGS)[number];

/**
 * "Daily Use Vegetables" (session 2026-09-06, client's own list) — the
 * handful of vegetables every household uses most days, picked once and
 * applied to all 7 days rather than re-picked per day like the 4 columns
 * above. Pulled out of the regular Vegetables column entirely (not just
 * duplicated) so the same product never appears pickable in two places at
 * once. Keyed by SKU rather than product id — stable across reseeds, and
 * legible in a diff if the list ever changes.
 */
export const DAILY_ESSENTIAL_VEGETABLE_SKUS = [
  'VEG-ONION',
  'VEG-POTATO',
  'VEG-TOMATO',
  'VEG-CARROT',
  'VEG-CABBAGE',
  'VEG-OKRA', // Lady Finger / भेंडी
  'VEG-BRINJAL',
] as const;
