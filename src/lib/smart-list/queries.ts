import { firstImageUrl } from '@/lib/catalog/queries';
import { pickName } from '@/lib/catalog/text';
import { db } from '@/lib/db';
import type { Locale, UnitType } from '@/generated/prisma/enums';
import { buildMatchIndex } from './index-builder';
import { matchItem } from './match';
import type { SmartListView } from './pipeline';
import { packCountFor, toBaseQuantity, unitRate } from './units';

/**
 * Reads for the Smart List review screen (M4).
 *
 * The top-3 alternatives for an ambiguous item are recomputed at read time
 * rather than stored. They depend on live stock — offering a customer a
 * "choose from these three" list where one sold out an hour ago is worse than
 * the extra work of recomputing.
 */

export async function getSmartList(
  smartListId: string,
  userId: string,
  locale: Locale,
): Promise<SmartListView | null> {
  const list = await db.smartList.findUnique({
    where: { id: smartListId },
    select: {
      id: true,
      userId: true,
      source: true,
      transcript: true,
      detectedLanguage: true,
      status: true,
      name: true,
      createdAt: true,
      items: {
        orderBy: { sortOrder: 'asc' },
        select: {
          id: true,
          rawText: true,
          parsedName: true,
          quantity: true,
          unit: true,
          matchedProductId: true,
          matchedVariantId: true,
          confidence: true,
          status: true,
        },
      },
    },
  });

  // R9 — ownership is checked here, not by trusting the id.
  if (!list || list.userId !== userId) return null;

  const needsAlternatives = list.items.some((item) => item.status === 'AMBIGUOUS');
  const index = needsAlternatives ? await buildMatchIndex(locale) : [];

  const matchedIds = list.items
    .map((item) => item.matchedProductId)
    .filter((id): id is string => id !== null);

  const products =
    matchedIds.length > 0
      ? await db.product.findMany({
          where: { id: { in: matchedIds } },
          select: {
            id: true,
            nameEn: true,
            nameMr: true,
            nameHi: true,
            imageUrls: true,
            variants: {
              where: { isActive: true },
              orderBy: [{ isDefault: 'desc' }, { quantity: 'asc' }],
              take: 1,
              select: { label: true, quantity: true, unit: true, pricePaise: true, stockQty: true },
            },
          },
        })
      : [];

  const productById = new Map(products.map((product) => [product.id, product]));

  return {
    id: list.id,
    source: list.source,
    transcript: list.transcript,
    detectedLanguage: list.detectedLanguage,
    status: list.status,
    name: list.name,
    createdAt: list.createdAt,
    usedFallback: false,
    items: list.items.map((item) => {
      const product = item.matchedProductId ? productById.get(item.matchedProductId) : undefined;
      const variant = product?.variants[0];

      const alternatives =
        item.status === 'AMBIGUOUS'
          ? matchItem(item.rawText, index).alternatives.map((candidate) => ({
              productId: candidate.productId,
              variantId: candidate.variantId,
              name: candidate.name,
              pricePaise: candidate.pricePaise,
              inStock: candidate.inStock,
              confidence: candidate.confidence,
            }))
          : [];

      // Real e-commerce unit pricing (session 2026-09-23, client reference
      // screenshot) — both derived straight from the matched variant's own
      // `pricePaise`/`quantity`/`unit`, see `units.ts`'s own doc comment.
      const packCount =
        variant && item.quantity && item.unit
          ? packCountFor(item.quantity, item.unit as UnitType, variant.quantity, variant.unit)
          : 1;
      const rate = variant ? unitRate(variant.quantity, variant.unit, variant.pricePaise) : null;

      return {
        id: item.id,
        rawText: item.rawText,
        parsedName: item.parsedName,
        quantity: item.quantity,
        unit: item.unit,
        matchedProductId: item.matchedProductId,
        matchedVariantId: item.matchedVariantId,
        matchedName: product ? pickName(product, locale) : null,
        imageUrl: product ? firstImageUrl(product.imageUrls) : null,
        variantLabel: variant?.label ?? null,
        variantBaseQuantity: variant ? toBaseQuantity(variant.quantity, variant.unit) : null,
        pricePaise: variant?.pricePaise ?? null,
        packCount,
        linePricePaise: variant ? variant.pricePaise * BigInt(packCount) : null,
        unitRatePaise: rate?.ratePaise ?? null,
        unitRateSuffix: rate?.suffix ?? null,
        inStock: (variant?.stockQty ?? 0) > 0,
        confidence: item.confidence,
        status: item.status,
        alternatives,
      };
    }),
  };
}

export interface SavedListSummary {
  id: string;
  name: string | null;
  source: string;
  itemCount: number;
  createdAt: Date;
}

/** M4 — "Saved lists — name and reuse ('Weekly Sabzi')." */
export async function listSmartLists(
  userId: string,
  { skip, take }: { skip: number; take: number },
): Promise<{ lists: SavedListSummary[]; total: number }> {
  const [rows, total] = await Promise.all([
    db.smartList.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
      select: {
        id: true,
        name: true,
        source: true,
        createdAt: true,
        _count: { select: { items: true } },
      },
    }),
    db.smartList.count({ where: { userId } }),
  ]);

  return {
    total,
    lists: rows.map((row) => ({
      id: row.id,
      name: row.name,
      source: row.source,
      itemCount: row._count.items,
      createdAt: row.createdAt,
    })),
  };
}
