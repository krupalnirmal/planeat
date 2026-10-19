import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `getTomorrowRequirement` — the vendor's "how much do I need to buy for
 * tomorrow" forecast (session 2026-10-19). Mocks `db` and `findNearestVendor`
 * directly rather than re-deriving real haversine matching through mocked
 * vendor rows — `tests/vendor-match.test.ts` already owns that correctness,
 * this file only owns the aggregation/filtering logic layered on top.
 */

const dbMock = vi.hoisted(() => ({
  subscription: { findMany: vi.fn() },
  subscriptionException: { findMany: vi.fn() },
  mealPlanDay: { findMany: vi.fn(), findUnique: vi.fn() },
}));

vi.mock('@/lib/db', () => ({ db: dbMock }));

const findNearestVendorMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/vendor/match', () => ({ findNearestVendor: findNearestVendorMock }));

import { getTomorrowRequirement } from '@/lib/vendor/forecast';

beforeEach(() => {
  vi.clearAllMocks();
  dbMock.subscriptionException.findMany.mockResolvedValue([]);
});

// 2026-10-19 10:00 UTC = 15:30 IST, so "tomorrow" (IST) is 2026-10-20.
const NOW = new Date('2026-10-19T10:00:00Z');

const ADDRESS = { latitude: 19.99, longitude: 73.78 };

function potatoItem(packs: number) {
  return {
    productId: 'prd_potato',
    quantity: packs,
    product: { nameEn: 'Potato', nameMr: 'बटाटा', nameHi: 'आलू' },
    variant: { id: 'var_potato_1kg', quantity: 1000, unit: 'G' },
  };
}

describe('getTomorrowRequirement', () => {
  it('is empty when no subscription covers tomorrow at all', async () => {
    dbMock.subscription.findMany.mockResolvedValue([]);

    const result = await getTomorrowRequirement('vnd_1', NOW);

    expect(result).toEqual([]);
    expect(findNearestVendorMock).not.toHaveBeenCalled();
  });

  it('excludes a subscription with a SKIP/PAUSE exception already recorded for tomorrow', async () => {
    dbMock.subscription.findMany.mockResolvedValue([
      { id: 'sub_1', mealPlanId: 'mp_1', deliveryMode: 'DAILY', startDate: new Date('2026-01-01'), address: ADDRESS },
    ]);
    dbMock.subscriptionException.findMany.mockResolvedValue([{ subscriptionId: 'sub_1' }]);

    const result = await getTomorrowRequirement('vnd_1', NOW);

    expect(result).toEqual([]);
    expect(findNearestVendorMock).not.toHaveBeenCalled();
  });

  it('excludes a subscription whose nearest vendor is someone else', async () => {
    dbMock.subscription.findMany.mockResolvedValue([
      { id: 'sub_1', mealPlanId: 'mp_1', deliveryMode: 'DAILY', startDate: new Date('2026-01-01'), address: ADDRESS },
    ]);
    findNearestVendorMock.mockResolvedValue({ id: 'vnd_other' });

    const result = await getTomorrowRequirement('vnd_1', NOW);

    expect(result).toEqual([]);
    expect(dbMock.mealPlanDay.findUnique).not.toHaveBeenCalled();
  });

  it('skips a template item with no variant (out of stock) rather than crashing', async () => {
    dbMock.subscription.findMany.mockResolvedValue([
      { id: 'sub_1', mealPlanId: 'mp_1', deliveryMode: 'DAILY', startDate: new Date('2026-01-01'), address: ADDRESS },
    ]);
    findNearestVendorMock.mockResolvedValue({ id: 'vnd_1' });
    dbMock.mealPlanDay.findUnique.mockResolvedValue({
      items: [{ ...potatoItem(1), variant: null }],
    });

    const result = await getTomorrowRequirement('vnd_1', NOW);

    expect(result).toEqual([]);
  });

  it('sums a shared variant across two of this vendor\'s subscriptions, in the variant\'s own unit', async () => {
    dbMock.subscription.findMany.mockResolvedValue([
      { id: 'sub_1', mealPlanId: 'mp_1', deliveryMode: 'DAILY', startDate: new Date('2026-01-01'), address: ADDRESS },
      { id: 'sub_2', mealPlanId: 'mp_2', deliveryMode: 'DAILY', startDate: new Date('2026-01-01'), address: ADDRESS },
    ]);
    findNearestVendorMock.mockResolvedValue({ id: 'vnd_1' });
    dbMock.mealPlanDay.findUnique
      .mockResolvedValueOnce({ items: [potatoItem(1)] }) // sub_1: 1 × 1000 g
      .mockResolvedValueOnce({ items: [potatoItem(2)] }); // sub_2: 2 × 1000 g

    const result = await getTomorrowRequirement('vnd_1', NOW, 'en');

    expect(result).toEqual([
      {
        productId: 'prd_potato',
        name: 'Potato',
        totalQuantity: 3000,
        unit: 'G',
        displayQuantity: '3 kg',
        subscriptionCount: 2,
      },
    ]);
  });

  it('combines every day\'s items for a WEEKLY subscription, not just tomorrow\'s weekday', async () => {
    // Tomorrow (IST) is 2026-10-20 — exactly 7 days after this startDate, so
    // `isDeliveryDueToday` counts it as this WEEKLY subscription's day.
    dbMock.subscription.findMany.mockResolvedValue([
      { id: 'sub_1', mealPlanId: 'mp_1', deliveryMode: 'WEEKLY', startDate: new Date('2026-10-13'), address: ADDRESS },
    ]);
    findNearestVendorMock.mockResolvedValue({ id: 'vnd_1' });
    dbMock.mealPlanDay.findMany.mockResolvedValue([
      { items: [potatoItem(1)] },
      { items: [potatoItem(1)] },
    ]);

    const result = await getTomorrowRequirement('vnd_1', NOW, 'en');

    expect(dbMock.mealPlanDay.findUnique).not.toHaveBeenCalled();
    expect(result).toEqual([
      expect.objectContaining({ productId: 'prd_potato', totalQuantity: 2000, subscriptionCount: 1 }),
    ]);
  });

  it('picks the product name in the requested locale', async () => {
    dbMock.subscription.findMany.mockResolvedValue([
      { id: 'sub_1', mealPlanId: 'mp_1', deliveryMode: 'DAILY', startDate: new Date('2026-01-01'), address: ADDRESS },
    ]);
    findNearestVendorMock.mockResolvedValue({ id: 'vnd_1' });
    dbMock.mealPlanDay.findUnique.mockResolvedValue({ items: [potatoItem(1)] });

    const result = await getTomorrowRequirement('vnd_1', NOW, 'mr');

    expect(result[0].name).toBe('बटाटा');
  });
});
