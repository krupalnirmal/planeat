import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Vendor order-packing reads (session 2026-10-16) — `listVendorOrders`'s
 * scoping and `getVendorOrderDetail`'s ownership gate. The pack mutation
 * itself reuses `changeOrderStatus` (`src/lib/admin/orders.ts`), already
 * covered by `tests/orders.test.ts` — not re-tested here.
 */

const dbMock = vi.hoisted(() => ({
  order: { findMany: vi.fn(), findUnique: vi.fn() },
}));

vi.mock('@/lib/db', () => ({ db: dbMock }));

import { getVendorOrderDetail, listVendorOrders, vendorOwnsOrder } from '@/lib/vendor/orders';

beforeEach(() => {
  vi.clearAllMocks();
});

const baseOrder = {
  id: 'ord_1',
  orderNumber: 'AC-1',
  status: 'CONFIRMED' as const,
  placedAt: new Date('2026-10-16T10:00:00Z'),
  items: [{ nameSnapshot: 'Onion', quantity: 2 }],
  assignment: null,
};

describe('listVendorOrders', () => {
  it('scopes the query to the given vendor and the packable statuses', async () => {
    dbMock.order.findMany.mockResolvedValue([baseOrder]);

    await listVendorOrders('vnd_1');

    expect(dbMock.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { vendorId: 'vnd_1', status: { in: ['PLACED', 'CONFIRMED', 'PACKED'] } },
      }),
    );
  });

  it('maps item snapshots to name/quantity and omits an unassigned order', async () => {
    dbMock.order.findMany.mockResolvedValue([baseOrder]);

    const rows = await listVendorOrders('vnd_1');

    expect(rows).toEqual([
      {
        id: 'ord_1',
        orderNumber: 'AC-1',
        status: 'CONFIRMED',
        placedAt: baseOrder.placedAt,
        items: [{ name: 'Onion', quantity: 2 }],
        assignment: null,
      },
    ]);
  });

  it('surfaces the delivery partner once an assignment exists', async () => {
    dbMock.order.findMany.mockResolvedValue([
      {
        ...baseOrder,
        status: 'PACKED',
        assignment: { status: 'ASSIGNED', partner: { user: { name: 'Rohit' } } },
      },
    ]);

    const [row] = await listVendorOrders('vnd_1');

    expect(row.assignment).toEqual({ status: 'ASSIGNED', partnerName: 'Rohit' });
  });
});

describe('getVendorOrderDetail', () => {
  it('returns null when the order belongs to a different vendor', async () => {
    dbMock.order.findUnique.mockResolvedValue({ ...baseOrder, vendorId: 'vnd_other' });

    const result = await getVendorOrderDetail('vnd_1', 'ord_1');

    expect(result).toBeNull();
  });

  it('returns null when the order does not exist', async () => {
    dbMock.order.findUnique.mockResolvedValue(null);

    const result = await getVendorOrderDetail('vnd_1', 'ord_missing');

    expect(result).toBeNull();
  });

  it('returns the order for its own vendor', async () => {
    dbMock.order.findUnique.mockResolvedValue({ ...baseOrder, vendorId: 'vnd_1' });

    const result = await getVendorOrderDetail('vnd_1', 'ord_1');

    expect(result?.id).toBe('ord_1');
    expect(result?.items).toEqual([{ name: 'Onion', quantity: 2 }]);
  });
});

describe('vendorOwnsOrder', () => {
  it('is true only when the order belongs to that vendor', async () => {
    dbMock.order.findUnique.mockResolvedValue({ vendorId: 'vnd_1' });
    expect(await vendorOwnsOrder('vnd_1', 'ord_1')).toBe(true);
    expect(await vendorOwnsOrder('vnd_other', 'ord_1')).toBe(false);
  });

  it('is false when the order does not exist', async () => {
    dbMock.order.findUnique.mockResolvedValue(null);
    expect(await vendorOwnsOrder('vnd_1', 'ord_missing')).toBe(false);
  });
});
