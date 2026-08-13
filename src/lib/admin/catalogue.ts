import { normaliseSearchText, pickName } from '@/lib/catalog/text';
import { db } from '@/lib/db';
import { isUniqueViolation } from '@/lib/db-errors';
import { ID_PREFIX, newId } from '@/lib/ids';
import type { Locale, UnitType } from '@/generated/prisma/enums';
import { audit } from './audit';

/**
 * M9 — Catalogue: categories and products CRUD, variants, pricing.
 *
 * B13 is enforced here, not left to whoever fills the form: only Vegetables
 * and Fruits may be meal-plan eligible. A misconfigured ice cream in a
 * customer's weekly plan is not a data-entry mistake anybody would spot before
 * it reached them.
 */

/** B13 — the only categories a meal plan may draw from. */
const MEAL_PLAN_CATEGORIES = new Set(['vegetables', 'fruits']);

export interface AdminProductRow {
  id: string;
  sku: string;
  name: string;
  nameEn: string;
  nameMr: string;
  nameHi: string;
  categoryId: string;
  categorySlug: string;
  unitType: UnitType;
  tags: string[];
  isActive: boolean;
  isMealPlanEligible: boolean;
  variantCount: number;
  aliasCount: number;
  lowestPricePaise: bigint | null;
  totalStock: number;
}

export async function listProducts(
  filter: { query?: string; categorySlug?: string; includeInactive?: boolean },
  locale: Locale,
  { skip, take }: { skip: number; take: number },
): Promise<{ products: AdminProductRow[]; total: number }> {
  const where = {
    ...(filter.includeInactive ? {} : { isActive: true }),
    ...(filter.categorySlug ? { category: { slug: filter.categorySlug } } : {}),
    ...(filter.query
      ? {
          OR: [
            { nameEn: { contains: filter.query } },
            { nameMr: { contains: filter.query } },
            { nameHi: { contains: filter.query } },
            { sku: { contains: filter.query } },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    db.product.findMany({
      where,
      orderBy: [{ sortOrder: 'asc' }, { nameEn: 'asc' }],
      skip,
      take,
      select: {
        id: true,
        sku: true,
        nameEn: true,
        nameMr: true,
        nameHi: true,
        categoryId: true,
        unitType: true,
        tags: true,
        isActive: true,
        isMealPlanEligible: true,
        category: { select: { slug: true } },
        variants: { select: { pricePaise: true, stockQty: true, isActive: true } },
        _count: { select: { aliases: true } },
      },
    }),
    db.product.count({ where }),
  ]);

  return {
    total,
    products: rows.map((row) => {
      const active = row.variants.filter((variant) => variant.isActive);
      const prices = active.map((variant) => variant.pricePaise);

      return {
        id: row.id,
        sku: row.sku,
        name: pickName(row, locale),
        nameEn: row.nameEn,
        nameMr: row.nameMr,
        nameHi: row.nameHi,
        categoryId: row.categoryId,
        categorySlug: row.category.slug,
        unitType: row.unitType,
        tags: Array.isArray(row.tags)
          ? row.tags.filter((tag): tag is string => typeof tag === 'string')
          : [],
        isActive: row.isActive,
        isMealPlanEligible: row.isMealPlanEligible,
        variantCount: active.length,
        aliasCount: row._count.aliases,
        lowestPricePaise: prices.length > 0 ? prices.reduce((a, b) => (a < b ? a : b)) : null,
        totalStock: active.reduce((sum, variant) => sum + variant.stockQty, 0),
      };
    }),
  };
}

export interface ProductInput {
  sku: string;
  nameEn: string;
  nameMr: string;
  nameHi: string;
  categoryId: string;
  unitType: UnitType;
  description?: string | null;
  tags: string[];
  isMealPlanEligible: boolean;
  isActive: boolean;
  sortOrder?: number;
}

export type ProductWriteResult =
  | { ok: true; productId: string }
  | { ok: false; reason: 'DUPLICATE_SKU' | 'CATEGORY_NOT_FOUND' };

/**
 * `search_keywords` is rebuilt on every write from the names and aliases. It
 * is a denormalisation for TiDB's lack of full-text search (PART 4.3), so it
 * has to be regenerated rather than edited — a stale copy makes a renamed
 * product unsearchable under its new name.
 */
async function buildSearchKeywords(productId: string | null, product: ProductInput) {
  const aliases =
    productId !== null
      ? await db.productAlias.findMany({ where: { productId }, select: { alias: true } })
      : [];

  return normaliseSearchText(
    [product.nameEn, product.nameMr, product.nameHi, ...aliases.map((row) => row.alias)].join(' '),
  );
}

export async function createProduct(
  input: ProductInput,
  actorId: string,
  ip: string | null,
): Promise<ProductWriteResult> {
  const category = await db.category.findUnique({
    where: { id: input.categoryId },
    select: { slug: true },
  });
  if (!category) return { ok: false, reason: 'CATEGORY_NOT_FOUND' };

  // B13 — enforced here so a form cannot put ice cream in a meal plan.
  const mealPlanEligible = input.isMealPlanEligible && MEAL_PLAN_CATEGORIES.has(category.slug);

  const productId = newId(ID_PREFIX.product);

  try {
    await db.product.create({
      data: {
        id: productId,
        sku: input.sku,
        nameEn: input.nameEn,
        nameMr: input.nameMr,
        nameHi: input.nameHi,
        categoryId: input.categoryId,
        unitType: input.unitType,
        description: input.description ?? null,
        imageUrls: [],
        tags: input.tags,
        isMealPlanEligible: mealPlanEligible,
        isActive: input.isActive,
        sortOrder: input.sortOrder ?? 0,
        searchKeywords: await buildSearchKeywords(null, input),
      },
    });
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, reason: 'DUPLICATE_SKU' };
    throw error;
  }

  await audit({
    actorId,
    action: 'product.create',
    entityType: 'Product',
    entityId: productId,
    after: { ...input, isMealPlanEligible: mealPlanEligible },
    ip,
  });

  return { ok: true, productId };
}

export async function updateProduct(
  productId: string,
  input: Partial<ProductInput>,
  actorId: string,
  ip: string | null,
): Promise<ProductWriteResult | { ok: false; reason: 'NOT_FOUND' }> {
  const existing = await db.product.findUnique({
    where: { id: productId },
    select: {
      id: true,
      sku: true,
      nameEn: true,
      nameMr: true,
      nameHi: true,
      categoryId: true,
      unitType: true,
      description: true,
      tags: true,
      isActive: true,
      isMealPlanEligible: true,
      sortOrder: true,
      category: { select: { slug: true } },
    },
  });

  if (!existing) return { ok: false, reason: 'NOT_FOUND' };

  const categorySlug = input.categoryId
    ? ((await db.category.findUnique({ where: { id: input.categoryId }, select: { slug: true } }))
        ?.slug ?? existing.category.slug)
    : existing.category.slug;

  const mealPlanEligible =
    input.isMealPlanEligible !== undefined
      ? input.isMealPlanEligible && MEAL_PLAN_CATEGORIES.has(categorySlug)
      : existing.isMealPlanEligible && MEAL_PLAN_CATEGORIES.has(categorySlug);

  const merged = {
    sku: input.sku ?? existing.sku,
    nameEn: input.nameEn ?? existing.nameEn,
    nameMr: input.nameMr ?? existing.nameMr,
    nameHi: input.nameHi ?? existing.nameHi,
  };

  try {
    await db.product.update({
      where: { id: productId },
      data: {
        ...(input.sku !== undefined ? { sku: input.sku } : {}),
        ...(input.nameEn !== undefined ? { nameEn: input.nameEn } : {}),
        ...(input.nameMr !== undefined ? { nameMr: input.nameMr } : {}),
        ...(input.nameHi !== undefined ? { nameHi: input.nameHi } : {}),
        ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
        ...(input.unitType !== undefined ? { unitType: input.unitType } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.tags !== undefined ? { tags: input.tags } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
        isMealPlanEligible: mealPlanEligible,
        searchKeywords: await buildSearchKeywords(productId, {
          ...merged,
          categoryId: existing.categoryId,
          unitType: existing.unitType,
          tags: [],
          isMealPlanEligible: mealPlanEligible,
          isActive: true,
        }),
      },
    });
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, reason: 'DUPLICATE_SKU' };
    throw error;
  }

  await audit({
    actorId,
    action: 'product.update',
    entityType: 'Product',
    entityId: productId,
    before: existing,
    after: { ...input, isMealPlanEligible: mealPlanEligible },
    ip,
  });

  return { ok: true, productId };
}

export interface VariantInput {
  label: string;
  quantity: number;
  unit: UnitType;
  mrpPaise: bigint;
  pricePaise: bigint;
  stockQty: number;
  lowStockThreshold: number;
  isDefault: boolean;
  isActive: boolean;
}

export async function upsertVariant(
  productId: string,
  variantId: string | null,
  input: VariantInput,
  actorId: string,
  ip: string | null,
): Promise<{ ok: true; variantId: string } | { ok: false; reason: 'PRODUCT_NOT_FOUND' }> {
  const product = await db.product.findUnique({ where: { id: productId }, select: { id: true } });
  if (!product) return { ok: false, reason: 'PRODUCT_NOT_FOUND' };

  const id = variantId ?? newId(ID_PREFIX.variant);

  const before = variantId
    ? await db.productVariant.findUnique({ where: { id: variantId } })
    : null;

  await db.$transaction(async (tx) => {
    // Exactly one default per product, or the product card and the meal plan
    // would disagree about which size is being priced.
    if (input.isDefault) {
      await tx.productVariant.updateMany({
        where: { productId, isDefault: true, ...(variantId ? { id: { not: variantId } } : {}) },
        data: { isDefault: false },
      });
    }

    if (variantId) {
      await tx.productVariant.update({ where: { id: variantId }, data: input });
    } else {
      await tx.productVariant.create({ data: { id, productId, ...input } });
    }
  });

  await audit({
    actorId,
    action: variantId ? 'variant.update' : 'variant.create',
    entityType: 'ProductVariant',
    entityId: id,
    before,
    after: input,
    ip,
  });

  return { ok: true, variantId: id };
}

// ─────────────────────────────────────────────────────────────
// Categories
// ─────────────────────────────────────────────────────────────

export interface CategoryInput {
  slug: string;
  nameEn: string;
  nameMr: string;
  nameHi: string;
  sortOrder: number;
  isActive: boolean;
  iconUrl?: string | null;
}

export async function upsertCategory(
  categoryId: string | null,
  input: CategoryInput,
  actorId: string,
  ip: string | null,
): Promise<{ ok: true; categoryId: string } | { ok: false; reason: 'DUPLICATE_SLUG' }> {
  const id = categoryId ?? newId(ID_PREFIX.category);
  const before = categoryId
    ? await db.category.findUnique({ where: { id: categoryId } })
    : null;

  try {
    if (categoryId) {
      await db.category.update({ where: { id: categoryId }, data: input });
    } else {
      await db.category.create({ data: { id, ...input } });
    }
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, reason: 'DUPLICATE_SLUG' };
    throw error;
  }

  await audit({
    actorId,
    action: categoryId ? 'category.update' : 'category.create',
    entityType: 'Category',
    entityId: id,
    before,
    after: input,
    ip,
  });

  return { ok: true, categoryId: id };
}

/**
 * M4 — "Alias dictionary managed in admin."
 *
 * The single highest-leverage thing the owner can do for the Smart List: a
 * customer's voice note that did not match is one row away from matching
 * forever.
 */
export async function addAlias(
  productId: string,
  alias: string,
  locale: Locale,
  actorId: string,
  ip: string | null,
): Promise<{ ok: boolean; reason?: 'PRODUCT_NOT_FOUND' | 'DUPLICATE' }> {
  const product = await db.product.findUnique({
    where: { id: productId },
    select: { id: true, nameEn: true, nameMr: true, nameHi: true },
  });
  if (!product) return { ok: false, reason: 'PRODUCT_NOT_FOUND' };

  try {
    await db.productAlias.create({
      data: { id: newId(ID_PREFIX.alias), productId, alias: alias.trim(), locale },
    });
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, reason: 'DUPLICATE' };
    throw error;
  }

  // The denormalised search column has to learn the new alias too.
  const aliases = await db.productAlias.findMany({
    where: { productId },
    select: { alias: true },
  });
  await db.product.update({
    where: { id: productId },
    data: {
      searchKeywords: normaliseSearchText(
        [product.nameEn, product.nameMr, product.nameHi, ...aliases.map((row) => row.alias)].join(
          ' ',
        ),
      ),
    },
  });

  await audit({
    actorId,
    action: 'alias.create',
    entityType: 'Product',
    entityId: productId,
    after: { alias, locale },
    ip,
  });

  return { ok: true };
}
