import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `bulkUpdateStock`'s optimistic-concurrency guard on stockQty (session
 * 2026-09-30) — a blind absolute write used to silently discard whatever
 * stock a live order had already sold while the admin's screen sat open.
 * Mocked against `db`, same pattern as `subscription-manage.test.ts`.
 */

const dbMock = vi.hoisted(() => ({
  productVariant: { findMany: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  auditLog: { create: vi.fn() },
  $transaction: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ db: dbMock }));

import { bulkUpdateStock } from '@/lib/admin/inventory';

const EXISTING_VARIANT = {
  id: 'var_1',
  stockQty: 50,
  lowStockThreshold: 10,
  pricePaise: 2_000n,
  isActive: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  dbMock.productVariant.findMany.mockResolvedValue([EXISTING_VARIANT]);
});

describe('bulkUpdateStock — stockQty optimistic concurrency', () => {
  it('applies the write when expectedStockQty still matches (no race)', async () => {
    dbMock.$transaction.mockResolvedValue([{ count: 1 }]);

    const result = await bulkUpdateStock(
      [{ variantId: 'var_1', stockQty: 48, expectedStockQty: 50 }],
      'admin_1',
      null,
    );

    expect(result).toEqual({ updated: 1, notFound: [], conflicted: [] });
    expect(dbMock.productVariant.updateMany).toHaveBeenCalledWith({
      where: { id: 'var_1', stockQty: 50 },
      data: { stockQty: 48 },
    });
  });

  it('reports a conflict instead of overwriting when the live stock moved since page-load', async () => {
    // A real order sold 5 units after the admin's screen loaded (was 50,
    // now 45) — the admin is about to save a stale "48" over it.
    dbMock.$transaction.mockResolvedValue([{ count: 0 }]);

    const result = await bulkUpdateStock(
      [{ variantId: 'var_1', stockQty: 48, expectedStockQty: 50 }],
      'admin_1',
      null,
    );

    expect(result).toEqual({ updated: 0, notFound: [], conflicted: ['var_1'] });
    // No audit row for a write that never actually applied.
    expect(dbMock.auditLog.create).not.toHaveBeenCalled();
  });

  it('falls back to an unconditional write when no expectedStockQty is given', async () => {
    dbMock.$transaction.mockResolvedValue([EXISTING_VARIANT]);

    const result = await bulkUpdateStock([{ variantId: 'var_1', stockQty: 48 }], 'admin_1', null);

    expect(result).toEqual({ updated: 1, notFound: [], conflicted: [] });
  });

  it('never guards a non-stock field, since nothing else has a concurrent writer', async () => {
    dbMock.$transaction.mockResolvedValue([EXISTING_VARIANT]);

    const result = await bulkUpdateStock(
      [{ variantId: 'var_1', lowStockThreshold: 5 }],
      'admin_1',
      null,
    );

    expect(result).toEqual({ updated: 1, notFound: [], conflicted: [] });
    expect(dbMock.productVariant.updateMany).not.toHaveBeenCalled();
  });

  it('reports an unknown variant id as notFound, not a conflict', async () => {
    dbMock.$transaction.mockResolvedValue([]);

    const result = await bulkUpdateStock(
      [{ variantId: 'var_missing', stockQty: 10, expectedStockQty: 10 }],
      'admin_1',
      null,
    );

    expect(result).toEqual({ updated: 0, notFound: ['var_missing'], conflicted: [] });
  });
});
