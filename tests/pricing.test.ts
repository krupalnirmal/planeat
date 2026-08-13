import { describe, expect, it } from 'vitest';
import { computeBill, isPaymentMethodAllowed, type FeeConfig } from '@/lib/orders/pricing';

/**
 * B10's fee table and B9's COD rules. These are the numbers on the bill the
 * customer actually reads, so every boundary is pinned.
 */

const CONFIG: FeeConfig = {
  minOrderValuePaise: 14_900n, // ₹149
  deliveryFeePaise: 2_500n, // ₹25
  freeDeliveryThresholdPaise: 29_900n, // ₹299
  handlingFeePaise: 0n, // B10: ₹0 — do not add one
  codMaxOrderPaise: 150_000n, // ₹1,500
  codEnabled: true,
};

function instant(itemTotalPaise: bigint, overrides: Partial<Parameters<typeof computeBill>[0]> = {}) {
  return computeBill({ itemTotalPaise, orderType: 'INSTANT', ...overrides }, CONFIG);
}

describe('B10 delivery fee', () => {
  it('charges ₹25 below the ₹299 threshold', () => {
    const bill = instant(20_000n);
    expect(bill.deliveryFeePaise).toBe(2_500n);
    expect(bill.totalPaise).toBe(22_500n);
  });

  it('is free exactly at the threshold, not one paisa above it', () => {
    expect(instant(29_900n).deliveryFeePaise).toBe(0n);
    expect(instant(29_899n).deliveryFeePaise).toBe(2_500n);
  });

  it('is free above the threshold', () => {
    expect(instant(50_000n).deliveryFeePaise).toBe(0n);
  });

  it('is always free on meal-plan orders (B2 — the plan fee covers it)', () => {
    const bill = computeBill({ itemTotalPaise: 5_000n, orderType: 'MEAL_PLAN_DAILY' }, CONFIG);
    expect(bill.deliveryFeePaise).toBe(0n);
  });

  it('lets a service area override the fee and the threshold', () => {
    const bill = instant(20_000n, {
      areaDeliveryFeePaise: 4_000n,
      areaFreeDeliveryThresholdPaise: 50_000n,
    });
    expect(bill.deliveryFeePaise).toBe(4_000n);
    expect(bill.freeDeliveryThresholdPaise).toBe(50_000n);
  });
});

describe('B10 free-delivery nudge', () => {
  it('reports exactly how much more is needed', () => {
    // ₹200 spent, ₹299 threshold → ₹99 to go.
    expect(instant(20_000n).amountForFreeDeliveryPaise).toBe(9_900n);
  });

  it('is zero once the threshold is reached', () => {
    expect(instant(29_900n).amountForFreeDeliveryPaise).toBe(0n);
    expect(instant(40_000n).amountForFreeDeliveryPaise).toBe(0n);
  });

  it('is zero on meal-plan orders, which never pay delivery', () => {
    const bill = computeBill({ itemTotalPaise: 5_000n, orderType: 'MEAL_PLAN_DAILY' }, CONFIG);
    expect(bill.amountForFreeDeliveryPaise).toBe(0n);
  });
});

describe('B10 minimum order value', () => {
  it('rejects below ₹149 and accepts exactly ₹149', () => {
    expect(instant(14_899n).meetsMinimum).toBe(false);
    expect(instant(14_900n).meetsMinimum).toBe(true);
  });

  it('does not apply to meal-plan deliveries', () => {
    const bill = computeBill({ itemTotalPaise: 5_000n, orderType: 'MEAL_PLAN_DAILY' }, CONFIG);
    expect(bill.meetsMinimum).toBe(true);
  });
});

describe('B10 handling fee', () => {
  it('is zero and does not appear in the total', () => {
    const bill = instant(30_000n);
    expect(bill.handlingFeePaise).toBe(0n);
    expect(bill.totalPaise).toBe(30_000n);
  });
});

describe('B9 cash on delivery', () => {
  it('is offered on an instant order within the cap', () => {
    expect(isPaymentMethodAllowed(instant(30_000n), 'COD')).toBe(true);
  });

  it('is withdrawn above the ₹1,500 cap', () => {
    const bill = instant(150_001n);
    expect(bill.codUnavailableReason).toBe('ABOVE_CAP');
    expect(isPaymentMethodAllowed(bill, 'COD')).toBe(false);
  });

  it('is allowed at exactly the cap', () => {
    // ₹1,500 item total, free delivery → total is exactly the cap.
    expect(instant(150_000n).codUnavailableReason).toBeNull();
  });

  it('is never offered on a meal-plan order', () => {
    const bill = computeBill({ itemTotalPaise: 20_000n, orderType: 'MEAL_PLAN_DAILY' }, CONFIG);
    expect(bill.codUnavailableReason).toBe('MEAL_PLAN');
    expect(isPaymentMethodAllowed(bill, 'COD')).toBe(false);
  });

  it('disappears entirely when FEATURE_COD is off', () => {
    const bill = computeBill(
      { itemTotalPaise: 30_000n, orderType: 'INSTANT' },
      { ...CONFIG, codEnabled: false },
    );
    expect(bill.codUnavailableReason).toBe('DISABLED');
    expect(bill.availablePaymentMethods).toEqual(['WALLET', 'RAZORPAY']);
  });

  it('always offers wallet and online payment', () => {
    expect(instant(30_000n).availablePaymentMethods).toContain('WALLET');
    expect(instant(30_000n).availablePaymentMethods).toContain('RAZORPAY');
  });
});

describe('discounts', () => {
  it('subtracts from the total', () => {
    const bill = instant(30_000n, { discountPaise: 5_000n });
    expect(bill.totalPaise).toBe(25_000n);
  });

  it('never produces a negative total', () => {
    const bill = instant(10_000n, { discountPaise: 99_999n });
    expect(bill.totalPaise).toBe(0n);
  });
});
