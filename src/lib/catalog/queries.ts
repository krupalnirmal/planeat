import { db } from '@/lib/db';
import { getStorageProvider } from '@/lib/services/storage';
import type { Prisma } from '@/generated/prisma/client';
import type { Locale, UnitType } from '@/generated/prisma/enums';
import { pickName, scoreMatch, searchTerms } from './text';

/**
 * Catalogue reads (M2).
 *
 * PART 12: "No endpoint issues more than 6 database round trips." Every
 * function here is written to a fixed, small number of queries regardless of
 * how many rows come back — variants and aliases are fetched with `include` or
 * a single batched `in` clause, never in a loop. On a Singapore database each
 * avoided round trip is worth 2 ms; from Mumbai it would be 60.
 */

export interface ProductCardView {
  id: string;
  slug: string;
  name: string;
  categorySlug: string;
  imageUrl: string | null;
  unitType: UnitType;
  isMealPlanEligible: boolean;
  vegetableType: string | null;
  variant: {
    id: string;
    label: string;
    quantity: number;
    unit: UnitType;
    pricePaise: bigint;
    mrpPaise: bigint;
    stockQty: number;
    lowStockThreshold: number;
  } | null;
  inStock: boolean;
}

export interface CategoryView {
  id: string;
  slug: string;
  name: string;
  iconUrl: string | null;
  isMealPlanEligible: boolean;
  imageUrl: string | null;
  productCount: number;
}

const CARD_IMAGE_WIDTH = 300;

function firstImageUrl(imageUrls: unknown): string | null {
  if (!Array.isArray(imageUrls) || imageUrls.length === 0) return null;
  const first = imageUrls[0];
  if (typeof first !== 'string' || first === '') return null;
  // M2 — images are served as f_auto,q_auto,w_300. Absolute URLs are already
  // final; a bare storage key still needs the provider's transformation.
  if (first.startsWith('http') || first.startsWith('/')) return first;
  return getStorageProvider().urlFor(first, { width: CARD_IMAGE_WIDTH, auto: true });
}

type ProductWithVariants = {
  id: string;
  sku: string;
  nameEn: string;
  nameMr: string;
  nameHi: string;
  imageUrls: unknown;
  unitType: UnitType;
  isMealPlanEligible: boolean;
  vegetableType: string | null;
  category: { slug: string };
  variants: Array<{
    id: string;
    label: string;
    quantity: number;
    unit: UnitType;
    pricePaise: bigint;
    mrpPaise: bigint;
    stockQty: number;
    lowStockThreshold: number;
    isDefault: boolean;
  }>;
};

/**
 * The one shape every product list uses. `satisfies` keeps the literal types
 * Prisma needs while still checking the select against the real model, which
 * `as const` cannot do — a readonly `orderBy` array is rejected by the client.
 */
const productCardSelect = {
  id: true,
  sku: true,
  nameEn: true,
  nameMr: true,
  nameHi: true,
  imageUrls: true,
  unitType: true,
  isMealPlanEligible: true,
  vegetableType: true,
  category: { select: { slug: true } },
  variants: {
    where: { isActive: true },
    orderBy: [{ isDefault: 'desc' }, { quantity: 'asc' }],
    select: {
      id: true,
      label: true,
      quantity: true,
      unit: true,
      pricePaise: true,
      mrpPaise: true,
      stockQty: true,
      lowStockThreshold: true,
      isDefault: true,
    },
  },
} satisfies Prisma.ProductSelect;

export function toProductCard(product: ProductWithVariants, locale: Locale): ProductCardView {
  const variant = product.variants[0] ?? null;
  return {
    id: product.id,
    slug: product.sku.toLowerCase(),
    name: pickName(product, locale),
    categorySlug: product.category.slug,
    imageUrl: firstImageUrl(product.imageUrls),
    unitType: product.unitType,
    isMealPlanEligible: product.isMealPlanEligible,
    vegetableType: product.vegetableType,
    variant: variant
      ? {
          id: variant.id,
          label: variant.label,
          quantity: variant.quantity,
          unit: variant.unit,
          pricePaise: variant.pricePaise,
          mrpPaise: variant.mrpPaise,
          stockQty: variant.stockQty,
          lowStockThreshold: variant.lowStockThreshold,
        }
      : null,
    inStock: (variant?.stockQty ?? 0) > 0,
  };
}

// ─────────────────────────────────────────────────────────────
// Home
// ─────────────────────────────────────────────────────────────

export interface HomePayload {
  categories: CategoryView[];
  banners: Array<{ id: string; title: string; imageUrl: string; linkUrl: string | null }>;
  bestsellers: ProductCardView[];
  /** PART 5 — 4-image collage tiles with a "+N more" badge. */
  collages: Array<{
    categorySlug: string;
    categoryName: string;
    images: string[];
    moreCount: number;
  }>;
}

/**
 * Three queries, flat. `/api/home` is the most-hit endpoint in the app and is
 * cached at the route.
 */
export async function getHomePayload(locale: Locale): Promise<HomePayload> {
  const now = new Date();

  const [categories, banners, bestsellers] = await Promise.all([
    db.category.findMany({
      where: { isActive: true, parentId: null },
      orderBy: { sortOrder: 'asc' },
      select: {
        id: true,
        slug: true,
        nameEn: true,
        nameMr: true,
        nameHi: true,
        iconUrl: true,
        products: {
          where: { isActive: true },
          orderBy: { sortOrder: 'asc' },
          select: { isMealPlanEligible: true, imageUrls: true },
          take: 5,
        },
        _count: { select: { products: { where: { isActive: true } } } },
      },
    }),

    db.banner.findMany({
      where: {
        isActive: true,
        OR: [{ startsAt: null }, { startsAt: { lte: now } }],
        AND: [{ OR: [{ endsAt: null }, { endsAt: { gte: now } }] }],
      },
      orderBy: { sortOrder: 'asc' },
      take: 5,
      select: { id: true, titleEn: true, titleMr: true, titleHi: true, imageUrl: true, linkUrl: true },
    }),

    db.product.findMany({
      where: { isActive: true, variants: { some: { isActive: true, stockQty: { gt: 0 } } } },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      take: 12,
      select: productCardSelect,
    }),
  ]);

  return {
    categories: categories.map((c) => ({
      id: c.id,
      slug: c.slug,
      name: pickName(c, locale),
      iconUrl: c.iconUrl,
      isMealPlanEligible: c.products.some((p) => p.isMealPlanEligible),
      imageUrl: firstImageUrl(c.products[0]?.imageUrls),
      productCount: c._count.products,
    })),

    banners: banners.map((b) => ({
      id: b.id,
      title: pickName({ nameEn: b.titleEn, nameMr: b.titleMr, nameHi: b.titleHi }, locale),
      imageUrl: b.imageUrl,
      linkUrl: b.linkUrl,
    })),

    bestsellers: bestsellers.map((p) => toProductCard(p, locale)),

    collages: categories.map((c) => {
      const images = c.products
        .map((p) => firstImageUrl(p.imageUrls))
        .filter((url): url is string => url !== null)
        .slice(0, 4);
      return {
        categorySlug: c.slug,
        categoryName: pickName(c, locale),
        images,
        moreCount: Math.max(0, c._count.products - images.length),
      };
    }),
  };
}

// ─────────────────────────────────────────────────────────────
// Categories & listings
// ─────────────────────────────────────────────────────────────

export async function getCategories(locale: Locale): Promise<CategoryView[]> {
  const categories = await db.category.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: 'asc' }, { nameEn: 'asc' }],
    select: {
      id: true,
      slug: true,
      nameEn: true,
      nameMr: true,
      nameHi: true,
      iconUrl: true,
      products: {
        where: { isActive: true },
        orderBy: { sortOrder: 'asc' },
        select: { isMealPlanEligible: true, imageUrls: true },
        take: 1,
      },
      _count: { select: { products: { where: { isActive: true } } } },
    },
  });

  return categories.map((c) => ({
    id: c.id,
    slug: c.slug,
    name: pickName(c, locale),
    iconUrl: c.iconUrl,
    isMealPlanEligible: c.products.some((p) => p.isMealPlanEligible),
    imageUrl: firstImageUrl(c.products[0]?.imageUrls),
    productCount: c._count.products,
  }));
}

export interface CategoryProductsResult {
  category: Pick<CategoryView, 'id' | 'slug' | 'name' | 'iconUrl' | 'isMealPlanEligible'>;
  products: ProductCardView[];
  total: number;
}

/** Two queries: the category (with its products) and the count. */
export async function getCategoryProducts(
  slug: string,
  locale: Locale,
  { skip, take }: { skip: number; take: number },
): Promise<CategoryProductsResult | null> {
  const category = await db.category.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      nameEn: true,
      nameMr: true,
      nameHi: true,
      iconUrl: true,
      isActive: true,
    },
  });

  if (!category || !category.isActive) return null;

  const [products, total] = await Promise.all([
    db.product.findMany({
      where: { categoryId: category.id, isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { nameEn: 'asc' }],
      skip,
      take,
      select: productCardSelect,
    }),
    db.product.count({ where: { categoryId: category.id, isActive: true } }),
  ]);

  return {
    category: {
      id: category.id,
      slug: category.slug,
      name: pickName(category, locale),
      iconUrl: category.iconUrl,
      isMealPlanEligible: products.some((p) => p.isMealPlanEligible),
    },
    products: products.map((p) => toProductCard(p, locale)),
    total,
  };
}

// ─────────────────────────────────────────────────────────────
// Product detail
// ─────────────────────────────────────────────────────────────

export interface ProductDetailView extends ProductCardView {
  description: string | null;
  nutrition: unknown;
  images: string[];
  categoryName: string;
  variants: Array<{
    id: string;
    label: string;
    quantity: number;
    unit: UnitType;
    pricePaise: bigint;
    mrpPaise: bigint;
    stockQty: number;
    lowStockThreshold: number;
    isDefault: boolean;
  }>;
  similar: ProductCardView[];
}

/** Two queries: the product with everything attached, then its siblings. */
export async function getProductDetail(
  id: string,
  locale: Locale,
): Promise<ProductDetailView | null> {
  const product = await db.product.findUnique({
    where: { id },
    select: {
      ...productCardSelect,
      description: true,
      nutrition: true,
      categoryId: true,
      category: { select: { slug: true, nameEn: true, nameMr: true, nameHi: true } },
      isActive: true,
    },
  });

  if (!product || !product.isActive) return null;

  const similar = await db.product.findMany({
    where: { categoryId: product.categoryId, isActive: true, id: { not: product.id } },
    orderBy: { sortOrder: 'asc' },
    take: 6,
    select: productCardSelect,
  });

  const images = Array.isArray(product.imageUrls)
    ? product.imageUrls.filter((url): url is string => typeof url === 'string')
    : [];

  const card = toProductCard(product, locale);

  return {
    ...card,
    description: product.description,
    nutrition: product.nutrition,
    images,
    categoryName: pickName(product.category, locale),
    variants: product.variants,
    similar: similar.map((p) => toProductCard(p, locale)),
  };
}

// ─────────────────────────────────────────────────────────────
// Search
// ─────────────────────────────────────────────────────────────

/**
 * Search (M2) — must find कांदा, `kanda` and `onion` as the same product.
 *
 * Two queries: one over the alias table, one over names and keywords. The
 * union is scored in memory, which is correct here because the result set is
 * bounded by `take` and the alternative — a `UNION ALL` with a computed rank —
 * is not expressible through Prisma without raw SQL against a database that
 * has no full-text index anyway.
 */
export async function searchProducts(
  query: string,
  locale: Locale,
  limit = 20,
): Promise<ProductCardView[]> {
  const terms = searchTerms(query);
  if (terms.length === 0) return [];

  const [aliasMatches, textMatches] = await Promise.all([
    db.productAlias.findMany({
      where: { OR: terms.map((term) => ({ alias: { contains: term } })) },
      select: { productId: true, alias: true },
      take: limit * 5,
    }),
    db.product.findMany({
      where: {
        isActive: true,
        OR: terms.flatMap((term) => [
          { nameEn: { contains: term } },
          { nameMr: { contains: term } },
          { nameHi: { contains: term } },
          { searchKeywords: { contains: term } },
        ]),
      },
      take: limit * 3,
      select: { ...productCardSelect, searchKeywords: true },
    }),
  ]);

  const aliasProductIds = [...new Set(aliasMatches.map((a) => a.productId))];
  const alreadyLoaded = new Set(textMatches.map((p) => p.id));
  const missingIds = aliasProductIds.filter((id) => !alreadyLoaded.has(id));

  const extra =
    missingIds.length > 0
      ? await db.product.findMany({
          where: { id: { in: missingIds }, isActive: true },
          take: limit * 3,
          select: { ...productCardSelect, searchKeywords: true },
        })
      : [];

  const aliasesByProduct = new Map<string, string[]>();
  for (const match of aliasMatches) {
    const list = aliasesByProduct.get(match.productId) ?? [];
    list.push(match.alias);
    aliasesByProduct.set(match.productId, list);
  }

  return [...textMatches, ...extra]
    .map((product) => ({
      product,
      score: scoreMatch(query, {
        names: [product.nameEn, product.nameMr, product.nameHi],
        aliases: aliasesByProduct.get(product.id) ?? [],
        keywords: product.searchKeywords ?? '',
      }),
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.product.nameEn.localeCompare(b.product.nameEn))
    .slice(0, limit)
    .map((entry) => toProductCard(entry.product, locale));
}

/**
 * "Order again" — distinct products this customer has bought before, newest
 * order first, still sellable today.
 *
 * The reference recording leans on this heavily ("Previously bought",
 * "Bought Earlier", the whole Order Again tab): in grocery, most of a basket
 * is the same things as last week, and making those one tap away is most of
 * what makes a quick-commerce app feel fast.
 *
 * Deliberately NOT part of `getHomePayload`: that payload is cached per
 * locale (`revalidate = 60`), and this is per-customer. Mixing them would
 * serve one person's history to everybody.
 */
export async function getPreviouslyBought(
  userId: string,
  locale: Locale,
  limit = 10,
): Promise<ProductCardView[]> {
  const items = await db.orderItem.findMany({
    where: { order: { userId } },
    orderBy: { order: { placedAt: 'desc' } },
    // Enough rows to survive de-duplication — a customer who orders the same
    // four vegetables every week would otherwise yield four cards from forty.
    take: limit * 8,
    select: { productId: true },
  });

  const seen = new Set<string>();
  const productIds: string[] = [];
  for (const item of items) {
    if (seen.has(item.productId)) continue;
    seen.add(item.productId);
    productIds.push(item.productId);
    if (productIds.length >= limit) break;
  }

  if (productIds.length === 0) return [];

  const products = await db.product.findMany({
    where: {
      id: { in: productIds },
      isActive: true,
      variants: { some: { isActive: true, stockQty: { gt: 0 } } },
    },
    select: productCardSelect,
  });

  // `findMany` returns them in the database's order, not the order they were
  // last bought in — restore the recency ranking the query established.
  const byId = new Map(products.map((product) => [product.id, product]));
  return productIds
    .map((id) => byId.get(id))
    .filter((product): product is (typeof products)[number] => product !== undefined)
    .map((product) => toProductCard(product, locale));
}
