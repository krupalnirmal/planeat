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

export interface StockHistoryEntry {
  id: string;
  action: string;
  /** Whatever `bulkUpdateStock` passed at the time — the full pre-update
      row for `before`, only the fields actually sent for `after` (session
      2026-09-19, Part N). Rendered as a plain key/value diff rather than a
      fixed shape, since which fields changed varies per edit. */
  before: unknown;
  after: unknown;
  actorName: string | null;
  createdAt: Date;
}

/** Dashboard v2's Inventory tab detail panel (Part N) — the stock-movement
    history nothing read back before this: `bulkUpdateStock` already writes
    one real `AuditLog` row per variant on every change, this just queries
    it back scoped to one variant instead of leaving those rows write-only. */
export async function getVariantDetail(
  variantId: string,
  locale: Locale,
): Promise<{ variant: InventoryRow; history: StockHistoryEntry[] } | null> {
  const row = await db.productVariant.findUnique({
    where: { id: variantId },
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
  });
  if (!row) return null;

  const historyRows = await db.auditLog.findMany({
    where: { entityType: 'ProductVariant', entityId: variantId },
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: {
      id: true,
      action: true,
      before: true,
      after: true,
      createdAt: true,
      actor: { select: { name: true, phone: true } },
    },
  });

  return {
    variant: {
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
    },
    history: historyRows.map((h) => ({
      id: h.id,
      action: h.action,
      before: h.before,
      after: h.after,
      actorName: h.actor?.name ?? h.actor?.phone ?? null,
      createdAt: h.createdAt,
    })),
  };
}

export interface StockUpdate {
  variantId: string;
  stockQty?: number;
  /** The stockQty the admin's screen showed when they started editing this
      row. Only meaningful alongside `stockQty` — see the guard below. */
  expectedStockQty?: number;
  lowStockThreshold?: number;
  pricePaise?: bigint;
  isActive?: boolean;
}

export interface BulkUpdateResult {
  updated: number;
  notFound: string[];
  /** Variants whose stockQty write was skipped because live orders changed
      it after the admin's screen loaded — never silently overwritten. */
  conflicted: string[];
}

/**
 * One transaction for the whole batch. A bulk update that half-applied would
 * leave the owner unable to tell which rows took, and the picklist they print
 * five minutes later would be built on it.
 *
 * stockQty is written as an absolute count (a shelf recount, not a delta) —
 * but it is also the one field the 00:30 job and live order placement both
 * decrement concurrently while the admin's screen sits open. A blind
 * `update()` here used to silently discard whatever stock real orders had
 * already sold in the meantime, reintroducing phantom stock and risking an
 * oversell (found session 2026-09-30). When the client sends back the
 * `expectedStockQty` it loaded the row with, the stockQty write is guarded
 * with `updateMany` on that exact value — a stale write affects 0 rows
 * instead of clobbering a real sale, and is reported back as `conflicted`
 * rather than reported as a silent success. Every other field (price,
 * threshold, active) has no concurrent writer, so it keeps the plain
 * unconditional update.
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

  const otherFields = (update: StockUpdate) => ({
    ...(update.lowStockThreshold !== undefined ? { lowStockThreshold: update.lowStockThreshold } : {}),
    ...(update.pricePaise !== undefined ? { pricePaise: update.pricePaise } : {}),
    ...(update.isActive !== undefined ? { isActive: update.isActive } : {}),
  });

  const results = await db.$transaction(
    applicable.map((update) => {
      if (update.stockQty !== undefined && update.expectedStockQty !== undefined) {
        return db.productVariant.updateMany({
          where: { id: update.variantId, stockQty: update.expectedStockQty },
          data: { stockQty: update.stockQty, ...otherFields(update) },
        });
      }
      return db.productVariant.update({
        where: { id: update.variantId },
        data: { ...(update.stockQty !== undefined ? { stockQty: update.stockQty } : {}), ...otherFields(update) },
      });
    }),
  );

  const conflicted: string[] = [];
  const applied: StockUpdate[] = [];
  applicable.forEach((update, i) => {
    const result = results[i];
    // Only `updateMany` results carry a `count` — a plain `update()` either
    // returns the row or throws, never a 0-row miss.
    if ('count' in result && result.count === 0) {
      conflicted.push(update.variantId);
    } else {
      applied.push(update);
    }
  });

  // One audit row per variant. A single row saying "12 variants changed" is
  // useless when the question is which one had the wrong price.
  for (const update of applied) {
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

  return { updated: applied.length, notFound, conflicted };
}
