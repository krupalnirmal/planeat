import { normaliseSearchText, pickName } from '@/lib/catalog/text';
import { db } from '@/lib/db';
import type { Locale } from '@/generated/prisma/enums';
import type { IndexedProduct } from './match';

/**
 * Builds the match index (M4).
 *
 * Two queries for the whole catalogue: products with their default variant,
 * and every alias. Everything else is in memory, because matching one spoken
 * list means scoring twenty item names against the catalogue and doing that
 * with queries would be four hundred round trips to Singapore.
 */
export async function buildMatchIndex(locale: Locale): Promise<IndexedProduct[]> {
  const products = await db.product.findMany({
    where: { isActive: true },
    select: {
      id: true,
      nameEn: true,
      nameMr: true,
      nameHi: true,
      unitType: true,
      searchKeywords: true,
      variants: {
        where: { isActive: true },
        orderBy: [{ isDefault: 'desc' }, { quantity: 'asc' }],
        take: 1,
        select: { id: true, pricePaise: true, stockQty: true },
      },
    },
  });

  const aliases = await db.productAlias.findMany({
    select: { productId: true, alias: true },
  });

  const aliasesByProduct = new Map<string, string[]>();
  for (const row of aliases) {
    const list = aliasesByProduct.get(row.productId) ?? [];
    list.push(row.alias);
    aliasesByProduct.set(row.productId, list);
  }

  return products.map((product) => {
    const variant = product.variants[0] ?? null;

    // Names in all three locales plus every alias, normalised once here rather
    // than on every comparison.
    const terms = [
      product.nameEn,
      product.nameMr,
      product.nameHi,
      ...(aliasesByProduct.get(product.id) ?? []),
    ]
      .map(normaliseSearchText)
      .filter((term) => term.length > 0);

    return {
      productId: product.id,
      variantId: variant?.id ?? null,
      name: pickName(product, locale),
      unitType: product.unitType,
      pricePaise: variant?.pricePaise ?? null,
      inStock: (variant?.stockQty ?? 0) > 0,
      terms: [...new Set(terms)],
    };
  });
}
