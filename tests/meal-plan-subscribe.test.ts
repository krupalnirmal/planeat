import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `activateSubscription`'s guard clauses — the refusals that must happen
 * BEFORE the transaction, mocked against `db`/settings/wallet rather than a
 * real database, mirroring `admin.test.ts`'s pattern for the pieces whose
 * real logic is aggregation/branching rather than SQL. The transaction body
 * itself (the actual `Subscription` row + plan-fee debit) is exercised live
 * against the dev database instead — see the session's scratch-script
 * verification, not a mock of Prisma's transaction API.
 */

const dbMock = vi.hoisted(() => ({
  mealPlan: { findFirst: vi.fn() },
  subscription: { findFirst: vi.fn(), count: vi.fn() },
  address: { findUnique: vi.fn() },
  mealPlanDay: { findMany: vi.fn() },
}));

vi.mock('@/lib/db', () => ({ db: dbMock }));

vi.mock('@/lib/settings', () => ({
  SETTING_KEYS: {
    planFeePaise: 'pricing.plan_fee_paise',
    mealPlanTrialDays: 'meal_plan.trial_days',
    walletPrepayBufferPercent: 'meal_plan.wallet_prepay_buffer_percent',
  },
  getSettingPaise: vi.fn().mockResolvedValue(9_900n),
  getSettingNumber: vi.fn().mockImplementation((key: string) =>
    key === 'meal_plan.trial_days' ? Promise.resolve(7) : Promise.resolve(15),
  ),
}));

vi.mock('@/lib/wallet/ledger', async () => {
  const actual = await vi.importActual<typeof import('@/lib/wallet/ledger')>('@/lib/wallet/ledger');
  return {
    ...actual,
    getBalance: vi.fn(),
    debit: vi.fn(),
  };
});

import { getBalance } from '@/lib/wallet/ledger';
import { activateSubscription } from '@/lib/meal-plan/subscribe';

const PLAN_WITH_ITEMS = {
  id: 'meal_plan_1',
  days: [{ items: [{ id: 'item_1' }] }, { items: [] }],
};

const PLAN_EMPTY = {
  id: 'meal_plan_1',
  days: [{ items: [] }, { items: [] }],
};

const INPUT = { addressId: 'addr_1', durationDays: 7, startDateKey: '2026-08-10' };

beforeEach(() => {
  vi.clearAllMocks();
  dbMock.mealPlanDay.findMany.mockResolvedValue([]);
});

describe('activateSubscription — refusals', () => {
  it('refuses when the customer has never saved a plan', async () => {
    dbMock.mealPlan.findFirst.mockResolvedValue(null);

    const result = await activateSubscription('user_1', INPUT);

    expect(result).toEqual({ ok: false, reason: 'NO_PLAN' });
  });

  it('refuses when the saved plan has nothing on any day', async () => {
    dbMock.mealPlan.findFirst.mockResolvedValue(PLAN_EMPTY);

    const result = await activateSubscription('user_1', INPUT);

    expect(result).toEqual({ ok: false, reason: 'EMPTY_PLAN' });
  });

  it('refuses a second subscription while one is already active', async () => {
    dbMock.mealPlan.findFirst.mockResolvedValue(PLAN_WITH_ITEMS);
    dbMock.subscription.findFirst.mockResolvedValue({ id: 'sub_existing' });

    const result = await activateSubscription('user_1', INPUT);

    expect(result).toEqual({ ok: false, reason: 'ALREADY_ACTIVE' });
  });

  it("refuses an address that is not the customer's own", async () => {
    dbMock.mealPlan.findFirst.mockResolvedValue(PLAN_WITH_ITEMS);
    dbMock.subscription.findFirst.mockResolvedValue(null);
    dbMock.address.findUnique.mockResolvedValue({ userId: 'someone_else' });

    const result = await activateSubscription('user_1', INPUT);

    expect(result).toEqual({ ok: false, reason: 'ADDRESS_NOT_FOUND' });
  });

  it('refuses with the exact shortfall when the wallet cannot cover the required balance', async () => {
    dbMock.mealPlan.findFirst.mockResolvedValue(PLAN_WITH_ITEMS);
    dbMock.subscription.findFirst.mockResolvedValue(null);
    dbMock.subscription.count.mockResolvedValue(1); // not a first plan — full fee applies
    dbMock.address.findUnique.mockResolvedValue({ userId: 'user_1' });
    dbMock.mealPlanDay.findMany.mockResolvedValue([
      { dayOfWeek: 1, items: [{ variant: { pricePaise: 100_000n } }] }, // ₹1,000/day
    ]);
    vi.mocked(getBalance).mockResolvedValue(50_000n); // ₹500 — nowhere near enough

    const result = await activateSubscription('user_1', INPUT);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('INSUFFICIENT_BALANCE');
      expect(result.shortfallPaise).toBeGreaterThan(0n);
    }
  });
});
