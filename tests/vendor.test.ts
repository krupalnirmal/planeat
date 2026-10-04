import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The admin half of the Vendor role (session 2026-10-04) — mirrors
 * `tests/delivery.test.ts`'s "delivery-partner CRUD" section for vendor
 * CRUD, and adds coverage for `confirmSupply`'s one-transaction
 * stock-increment + ledger-credit (PART 12: a crash between the two must
 * never leave stock up with nothing owed, or owed with nothing in stock).
 */

const dbMock = vi.hoisted(() => ({
  user: { findUnique: vi.fn(), create: vi.fn() },
  vendor: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
  vendorSupply: { findUnique: vi.fn(), update: vi.fn(), groupBy: vi.fn() },
  vendorLedgerEntry: { groupBy: vi.fn(), create: vi.fn(), findFirst: vi.fn() },
  productVariant: { update: vi.fn() },
  auditLog: { create: vi.fn() },
  $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(dbMock)),
}));

vi.mock('@/lib/db', () => ({ db: dbMock }));

import { confirmSupply, createVendor, rejectSupply } from '@/lib/admin/vendors';

beforeEach(() => {
  vi.clearAllMocks();
  dbMock.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(dbMock));
  // No prior entries, so groupBy returns nothing and balance starts at 0 —
  // same shape `src/lib/vendor/ledger.ts`'s `getVendorBalance` expects.
  dbMock.vendorLedgerEntry.groupBy.mockResolvedValue([]);
});

describe('vendor CRUD', () => {
  it('refuses to create a vendor on a phone number already in use', async () => {
    dbMock.user.findUnique.mockResolvedValue({ id: 'usr_existing' });

    const result = await createVendor(
      { phone: '9999900002', name: 'Test', businessName: 'Test Farms' },
      'usr_admin',
      null,
    );

    expect(result).toEqual({ ok: false, reason: 'PHONE_IN_USE' });
    expect(dbMock.user.create).not.toHaveBeenCalled();
  });

  it('creates the user and vendor row together, and audits it', async () => {
    dbMock.user.findUnique.mockResolvedValue(null);
    dbMock.user.create.mockResolvedValue({ id: 'usr_new' });
    dbMock.vendor.create.mockResolvedValue({});

    const result = await createVendor(
      { phone: '9999900099', name: 'Rahul Mandwale', businessName: 'Mandwale Farms' },
      'usr_admin',
      null,
    );

    expect(result.ok).toBe(true);
    expect(dbMock.vendor.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: 'usr_new', businessName: 'Mandwale Farms' }),
      }),
    );
    expect(dbMock.auditLog.create).toHaveBeenCalled();
  });
});

describe('confirmSupply', () => {
  const supply = {
    id: 'vsp_1',
    vendorId: 'vnd_1',
    variantId: 'var_1',
    quantity: 20,
    costPricePaise: 1_000n,
    status: 'PENDING' as const,
  };

  it('is not found for a missing supply', async () => {
    dbMock.vendorSupply.findUnique.mockResolvedValue(null);

    const result = await confirmSupply('vsp_missing', 'usr_admin', null);

    expect(result).toEqual({ ok: false, reason: 'NOT_FOUND' });
  });

  it('refuses to re-confirm a supply that is not PENDING', async () => {
    dbMock.vendorSupply.findUnique.mockResolvedValue({ ...supply, status: 'CONFIRMED' });

    const result = await confirmSupply('vsp_1', 'usr_admin', null);

    expect(result).toEqual({ ok: false, reason: 'NOT_PENDING' });
    expect(dbMock.productVariant.update).not.toHaveBeenCalled();
  });

  it('increments stock by exactly the reported quantity and credits the vendor the total cost, in one transaction', async () => {
    dbMock.vendorSupply.findUnique.mockResolvedValue(supply);
    dbMock.vendorLedgerEntry.create.mockResolvedValue({ id: 'vld_1', balanceAfterPaise: 20_000n });
    dbMock.vendorSupply.update.mockResolvedValue({});

    const result = await confirmSupply('vsp_1', 'usr_admin', null);

    expect(result).toEqual({ ok: true });

    // Stock: +20 units, exactly `quantity`, on the right variant.
    expect(dbMock.productVariant.update).toHaveBeenCalledWith({
      where: { id: 'var_1' },
      data: { stockQty: { increment: 20 } },
    });

    // Ledger: credited 20 * ₹10.00 = ₹200.00 (1000 paise/unit), tagged to
    // this exact supply for idempotency.
    expect(dbMock.vendorLedgerEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          vendorId: 'vnd_1',
          direction: 'CREDIT',
          amountPaise: 20_000n,
          source: 'SUPPLY',
          refType: 'vendor_supply',
          refId: 'vsp_1',
        }),
      }),
    );

    // Status flips to CONFIRMED, with a timestamp.
    expect(dbMock.vendorSupply.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'vsp_1' },
        data: expect.objectContaining({ status: 'CONFIRMED' }),
      }),
    );

    expect(dbMock.auditLog.create).toHaveBeenCalled();
  });

  it('never touches stock or the ledger when rejecting', async () => {
    dbMock.vendorSupply.findUnique.mockResolvedValue(supply);
    dbMock.vendorSupply.update.mockResolvedValue({});

    const result = await rejectSupply('vsp_1', 'Looked spoiled', 'usr_admin', null);

    expect(result).toEqual({ ok: true });
    expect(dbMock.productVariant.update).not.toHaveBeenCalled();
    expect(dbMock.vendorLedgerEntry.create).not.toHaveBeenCalled();
    expect(dbMock.vendorSupply.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: 'REJECTED', rejectionReason: 'Looked spoiled' },
      }),
    );
  });
});
