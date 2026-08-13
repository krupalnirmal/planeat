import { pickName } from '@/lib/catalog/text';
import { db } from '@/lib/db';
import type { Locale } from '@/generated/prisma/enums';
import { audit } from './audit';

/**
 * M9 — Inventory: stock levels, thresholds, bulk update, mark unavailable.
 *
 * Stock is the number that decides whether tomorrow's 00:30 job substitutes a
 * vegetable (B7). Getting it wrong at 21:00 means a customer gets something
 * they did not order at 07:00, so every write here is audited and every bulk
 * write is one transaction.
 */

export interface InventoryRow {
  variantId: string;
  productId: string;
  productName: string;
  categorySlug: string;
  label: string;
  quantity: number;
  unit: string;
  stockQty: number;
  lowStockThreshold: number;
  pricePaise: bigint;
  isActive: boolean;
  isLow: boolean;
  isOut: boolean;
  isMealPlanEligible: boolean;
}

export interface InventoryFilter {
  query?: string;
  categorySlug?: string;
  /** The two views the owner actually opens this screen for. */
  onlyLow?: boolean;
  onlyOut?: boolean;
}

export async function listInventory(
  filter: InventoryFilter,
  locale: Locale,
  { skip, take }: { skip: number; take: number },
): Promise<{ rows: InventoryRow[]; total: number }> {
  const where = {
    ...(filter.onlyOut ? { stockQty: { lte: 0 } } : {}),
    product: {
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
    },
  };

  const [rows, total] = await Promise.all([
    db.productVariant.findMany({
      where,
      orderBy: [{ stockQty: 'asc' }, { id: 'asc' }],
      skip,
      take,
      select: {
        id: true,
        label: true,
        quantity: true,
        unit: true,
        stockQty: true,
        lowStockThreshold: true,
        pricePaise: true,
        isActive: true,
        product: {
          select: {
            id: true,
            nameEn: true,
            nameMr: true,
            nameHi: true,
            isMealPlanEligible: true,
            category: { select: { slug: true } },
          },
        },
      },
    }),
    db.productVariant.count({ where }),
  ]);

  const mapped = rows.map((row) => ({
    variantId: row.id,
    productId: row.product.id,
    productName: pickName(row.product, locale),
    categorySlug: row.product.category.slug,
    label: row.label,
    quantity: row.quantity,
    unit: row.unit,
    stockQty: row.stockQty,
    lowStockThreshold: row.lowStockThreshold,
    pricePaise: row.pricePaise,
    isActive: row.isActive,
    isLow: row.stockQty > 0 && row.stockQty <= row.lowStockThreshold,
    isOut: row.stockQty <= 0,
    isMealPlanEligible: row.product.isMealPlanEligible,
  }));

  // Prisma cannot compare two columns in a `where`, so "low" is filtered here.
  // The count is corrected too, rather than reporting a total the rows do not
  // match.
  if (filter.onlyLow) {
    const low = mapped.filter((row) => row.isLow);
    return { rows: low, total: low.length };
  }

  return { rows: mapped, total };
}

export interface StockUpdate {
  variantId: string;
  stockQty?: number;
  lowStockThreshold?: number;
  pricePaise?: bigint;
  isActive?: boolean;
}

export interface BulkUpdateResult {
  updated: number;
  notFound: string[];
}

/**
 * One transaction for the whole batch. A bulk update that half-applied would
 * leave the owner unable to tell which rows took, and the picklist they print
 * five minutes later would be built on it.
 */
export async function bulkUpdateStock(
  updates: readonly StockUpdate[],
  actorId: string,
  ip: string | null,
): Promise<BulkUpdateResult> {
  const ids = updates.map((update) => update.variantId);

  const existing = await db.productVariant.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      stockQty: true,
      lowStockThreshold: true,
      pricePaise: true,
      isActive: true,
    },
  });

  const byId = new Map(existing.map((variant) => [variant.id, variant]));
  const notFound = ids.filter((id) => !byId.has(id));
  const applicable = updates.filter((update) => byId.has(update.variantId));

  await db.$transaction(
    applicable.map((update) =>
      db.productVariant.update({
        where: { id: update.variantId },
        data: {
          ...(update.stockQty !== undefined ? { stockQty: update.stockQty } : {}),
          ...(update.lowStockThreshold !== undefined
            ? { lowStockThreshold: update.lowStockThreshold }
            : {}),
          ...(update.pricePaise !== undefined ? { pricePaise: update.pricePaise } : {}),
          ...(update.isActive !== undefined ? { isActive: update.isActive } : {}),
        },
      }),
    ),
  );

  // One audit row per variant. A single row saying "12 variants changed" is
  // useless when the question is which one had the wrong price.
  for (const update of applicable) {
    const before = byId.get(update.variantId);
    await audit({
      actorId,
      action: 'inventory.update',
      entityType: 'ProductVariant',
      entityId: update.variantId,
      before,
      after: update,
      ip,
    });
  }

  return { updated: applicable.length, notFound };
}
