import { db } from '@/lib/db';
import { pickName } from '@/lib/catalog/text';
import type { Locale, UnitType } from '@/generated/prisma/enums';
import { containsAllergen, isJainExcluded, isVeganExcluded } from './allergens';

/**
 * PART 6.3 rule 3 — hard constraints in CODE, not in prompts.
 *
 *   "Allergens and dislikes are removed from the catalogue *before* the call
 *    and re-checked *after*."
 *
 * This is the "before" half. The model is never given a product it must not
 * pick, so "please avoid peanuts" is not something it can forget, misread or
 * be talked out of. The "after" half lives in `validate.ts`, because a model
 * can also return an id that was never in the list.
 *
 * B13 — only Vegetables and Fruits are meal-plan eligible. Ice cream is not a
 * meal plan.
 */

export interface CandidateProduct {
  id: string;
  sku: string;
  name: string;
  nameEn: string;
  nameMr: string;
  nameHi: string;
  categorySlug: string;
  unitType: UnitType;
  tags: string[];
  /** The default sellable variant, for pricing and stock. */
  variant: {
    id: string;
    quantity: number;
    unit: UnitType;
    pricePaise: bigint;
    stockQty: number;
  } | null;
}

export interface CandidateFilterInput {
  allergies: readonly string[];
  dislikedProductIds: readonly string[];
  dietaryPreference: string;
  locale: Locale;
}

export interface CandidateResult {
  candidates: CandidateProduct[];
  /** What was removed and why — logged, and shown to admin on a thin plan. */
  excluded: Array<{ productId: string; name: string; reason: string }>;
}

/**
 * Loads the eligible catalogue and strips everything the customer must not be
 * given. Two queries: products with their default variant, and the alias table
 * (aliases materially improve allergen text matching — "singdana" is not in
 * any product name).
 */
export async function buildCandidates(input: CandidateFilterInput): Promise<CandidateResult> {
  const products = await db.product.findMany({
    where: {
      isActive: true,
      isMealPlanEligible: true,
      // Nothing that cannot actually be delivered tomorrow.
      variants: { some: { isActive: true, stockQty: { gt: 0 } } },
    },
    orderBy: [{ sortOrder: 'asc' }, { nameEn: 'asc' }],
    select: {
      id: true,
      sku: true,
      nameEn: true,
      nameMr: true,
      nameHi: true,
      unitType: true,
      tags: true,
      searchKeywords: true,
      category: { select: { slug: true } },
      variants: {
        where: { isActive: true, stockQty: { gt: 0 } },
        orderBy: [{ isDefault: 'desc' }, { quantity: 'asc' }],
        take: 1,
        select: { id: true, quantity: true, unit: true, pricePaise: true, stockQty: true },
      },
    },
  });

  const aliasRows = await db.productAlias.findMany({
    where: { productId: { in: products.map((product) => product.id) } },
    select: { productId: true, alias: true },
  });

  const aliasesByProduct = new Map<string, string[]>();
  for (const row of aliasRows) {
    const list = aliasesByProduct.get(row.productId) ?? [];
    list.push(row.alias);
    aliasesByProduct.set(row.productId, list);
  }

  const disliked = new Set(input.dislikedProductIds);
  const candidates: CandidateProduct[] = [];
  const excluded: CandidateResult['excluded'] = [];

  for (const product of products) {
    const name = pickName(product, input.locale);
    const checkable = {
      id: product.id,
      nameEn: product.nameEn,
      nameMr: product.nameMr,
      nameHi: product.nameHi,
      tags: product.tags,
      searchKeywords: product.searchKeywords,
      aliases: aliasesByProduct.get(product.id) ?? [],
    };

    // S4 — the allergen block comes first. Nothing else can override it.
    if (containsAllergen(checkable, input.allergies)) {
      excluded.push({ productId: product.id, name, reason: 'ALLERGEN' });
      continue;
    }

    // B6 — a swapped-away vegetable is added to dislikes, and a disliked
    // vegetable must never appear in a freshly generated plan.
    if (disliked.has(product.id)) {
      excluded.push({ productId: product.id, name, reason: 'DISLIKED' });
      continue;
    }

    if (input.dietaryPreference === 'JAIN' && isJainExcluded(checkable)) {
      excluded.push({ productId: product.id, name, reason: 'JAIN' });
      continue;
    }

    if (input.dietaryPreference === 'VEGAN' && isVeganExcluded(checkable)) {
      excluded.push({ productId: product.id, name, reason: 'VEGAN' });
      continue;
    }

    const variant = product.variants[0] ?? null;

    candidates.push({
      id: product.id,
      sku: product.sku,
      name,
      nameEn: product.nameEn,
      nameMr: product.nameMr,
      nameHi: product.nameHi,
      categorySlug: product.category.slug,
      unitType: product.unitType,
      tags: Array.isArray(product.tags)
        ? product.tags.filter((tag): tag is string => typeof tag === 'string')
        : [],
      variant,
    });
  }

  return { candidates, excluded };
}
