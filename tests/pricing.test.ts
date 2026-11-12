import { describe, expect, it } from 'vitest';
import { computeBill, isPaymentMethodAllowed, type FeeConfig } from '@/lib/orders/pricing';

/**
 * B10's fee table and B9's COD rules. These are the numbers on the bill the
 * customer actually reads, so every boundary is pinned.
 *
 * Session 2026-11-12 (client's Blinkit-style reference) — below the
 * threshold, every order now pays delivery + a flat handling fee + a "high
 * demand surge charge"; at/above it, delivery and surge both drop to ₹0
 * (handling never waives). Meal-plan days pay their own, lower delivery rate
 * instead of being free outright.
 */

const CONFIG: FeeConfig = {
  minOrderValuePaise: 14_900n, // ₹149 — the mechanism is still tested even though the live default is now ₹0
  deliveryFeePaise: 2_500n, // ₹25 (instant)
  mealPlanDeliveryFeePaise: 1_500n, // ₹15 (meal plan)
  freeDeliveryThresholdPaise: 20_000n, // ₹200
  handlingFeePaise: 300n, // ₹3
  surgeChargePaise: 200n, // ₹2
  codMaxOrderPaise: 150_000n, // ₹1,500
  codEnabled: true,
};

function instant(itemTotalPaise: bigint, overrides: Partial<Parameters<typeof computeBill>[0]> = {}) {
  return computeBill({ itemTotalPaise, orderType: 'INSTANT', ...overrides }, CONFIG);
}

function mealPlan(itemTotalPaise: bigint) {
  return computeBill({ itemTotalPaise, orderType: 'MEAL_PLAN_DAILY' }, CONFIG);
}

describe('B10 delivery fee', () => {
  it('charges ₹25 below the ₹200 threshold (instant)', () => {
    const bill = instant(15_000n);
    expect(bill.deliveryFeePaise).toBe(2_500n);
    // 15,000 + 2,500 delivery + 300 handling + 200 surge
    expect(bill.totalPaise).toBe(18_000n);
  });

  it('is free exactly at the threshold, not one paisa below it', () => {
    expect(instant(20_000n).deliveryFeePaise).toBe(0n);
    expect(instant(19_999n).deliveryFeePaise).toBe(2_500n);
  });

  it('is free above the threshold', () => {
    expect(instant(50_000n).deliveryFeePaise).toBe(0n);
  });

  it('charges its own, lower ₹15 rate below the threshold on meal-plan orders', () => {
    const bill = mealPlan(5_000n);
    expect(bill.deliveryFeePaise).toBe(1_500n);
  });

  it('is free on meal-plan orders at/above the threshold too', () => {
    expect(mealPlan(20_000n).deliveryFeePaise).toBe(0n);
  });

  it('lets a service area override the instant fee and the threshold', () => {
    const bill = instant(15_000n, {
      areaDeliveryFeePaise: 4_000n,
      areaFreeDeliveryThresholdPaise: 50_000n,
    });
    expect(bill.deliveryFeePaise).toBe(4_000n);
    expect(bill.freeDeliveryThresholdPaise).toBe(50_000n);
  });

  it('ignores an instant-order area override on meal-plan orders (always its own flat rate)', () => {
    const bill = computeBill(
      {
        itemTotalPaise: 5_000n,
        orderType: 'MEAL_PLAN_DAILY',
        areaDeliveryFeePaise: 4_000n,
      },
      CONFIG,
    );
    expect(bill.deliveryFeePaise).toBe(1_500n);
  });
});

describe('B10 high demand surge charge', () => {
  it('charges ₹2 below the threshold', () => {
    expect(instant(15_000n).surgeChargePaise).toBe(200n);
    expect(mealPlan(5_000n).surgeChargePaise).toBe(200n);
  });

  it('is waived at/above the threshold, same as delivery', () => {
    expect(instant(20_000n).surgeChargePaise).toBe(0n);
    expect(mealPlan(20_000n).surgeChargePaise).toBe(0n);
  });
});

describe('B10 handling fee', () => {
  it('is a flat ₹3 and never waives, below the threshold', () => {
    expect(instant(15_000n).handlingFeePaise).toBe(300n);
  });

  it('is still charged at/above the threshold, unlike delivery and surge', () => {
    const bill = instant(20_000n);
    expect(bill.handlingFeePaise).toBe(300n);
    expect(bill.deliveryFeePaise).toBe(0n);
    expect(bill.surgeChargePaise).toBe(0n);
    expect(bill.totalPaise).toBe(20_300n);
  });
});

describe('B10 free-delivery nudge', () => {
  it('reports exactly how much more is needed', () => {
    // ₹150 spent, ₹200 threshold → ₹50 to go.
    expect(instant(15_000n).amountForFreeDeliveryPaise).toBe(5_000n);
  });

  it('is zero once the threshold is reached', () => {
    expect(instant(20_000n).amountForFreeDeliveryPaise).toBe(0n);
    expect(instant(40_000n).amountForFreeDeliveryPaise).toBe(0n);
  });

  it('applies on meal-plan orders too, now that they pay delivery below the threshold', () => {
    expect(mealPlan(5_000n).amountForFreeDeliveryPaise).toBe(15_000n);
    expect(mealPlan(20_000n).amountForFreeDeliveryPaise).toBe(0n);
  });
});

describe('B10 minimum order value', () => {
  it('rejects below ₹149 and accepts exactly ₹149', () => {
    expect(instant(14_899n).meetsMinimum).toBe(false);
    expect(instant(14_900n).meetsMinimum).toBe(true);
  });

  it('does not apply to meal-plan deliveries', () => {
    expect(mealPlan(5_000n).meetsMinimum).toBe(true);
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
    // ₹1,497 item total, free delivery/surge above threshold + ₹3 handling
    // → total is exactly the ₹1,500 cap.
    expect(instant(149_700n).codUnavailableReason).toBeNull();
  });

  it('is never offered on a meal-plan order', () => {
    const bill = mealPlan(20_000n);
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
    // 30,000 item total (above threshold: delivery/surge ₹0) + ₹3 handling − ₹50 discount.
    const bill = instant(30_000n, { discountPaise: 5_000n });
    expect(bill.totalPaise).toBe(25_300n);
  });

  it('never produces a negative total', () => {
    const bill = instant(10_000n, { discountPaise: 99_999n });
    expect(bill.totalPaise).toBe(0n);
  });
});
