import { describe, expect, it } from 'vitest';
import {
  addDays,
  averageDailyCost,
  computePlanFee,
  computePrepay,
  endDateFor,
  estimatePeriodCost,
  parseDateKey,
  shortfallPaise,
  toDateKey,
  weekdayNumber,
  type PlanDayCost,
} from '@/lib/meal-plan/pricing';

/**
 * B2's pricing and B3's prepayment — the numbers on the approval screen.
 *
 * PART 12 — "Approving a plan prepays the wallet and creates a subscription
 * with the right dates." The date arithmetic and the money are pinned here;
 * the subscription row itself needs a database.
 */

// A week where every day costs a different amount, so a wrong weekday mapping
// shows up as a wrong total rather than coincidentally matching.
const WEEK: PlanDayCost[] = [
  { dayOfWeek: 1, costPaise: 10_000n }, // Monday    ₹100
  { dayOfWeek: 2, costPaise: 20_000n }, // Tuesday   ₹200
  { dayOfWeek: 3, costPaise: 30_000n }, // Wednesday ₹300
  { dayOfWeek: 4, costPaise: 40_000n }, // Thursday  ₹400
  { dayOfWeek: 5, costPaise: 50_000n }, // Friday    ₹500
  { dayOfWeek: 6, costPaise: 60_000n }, // Saturday  ₹600
  { dayOfWeek: 7, costPaise: 70_000n }, // Sunday    ₹700
];

const WEEK_TOTAL = 280_000n; // ₹2,800

describe('calendar arithmetic', () => {
  it('maps JS Sunday=0 onto the schema Monday=1…Sunday=7', () => {
    // 2026-08-10 is a Monday.
    expect(weekdayNumber(parseDateKey('2026-08-10'))).toBe(1);
    expect(weekdayNumber(parseDateKey('2026-08-15'))).toBe(6);
    expect(weekdayNumber(parseDateKey('2026-08-16'))).toBe(7);
  });

  it('treats a date key as timezone-free', () => {
    // Doing this on a local Date would shift the plan by a day for anyone
    // whose server is not in IST.
    expect(toDateKey(parseDateKey('2026-08-10'))).toBe('2026-08-10');
    expect(toDateKey(addDays(parseDateKey('2026-08-31'), 1))).toBe('2026-09-01');
  });

  it('computes an inclusive end date', () => {
    // A 7-day plan starting Monday ends the following Sunday, not Monday.
    expect(toDateKey(endDateFor(parseDateKey('2026-08-10'), 7))).toBe('2026-08-16');
    expect(toDateKey(endDateFor(parseDateKey('2026-08-10'), 30))).toBe('2026-09-08');
  });

  it('crosses a month boundary correctly', () => {
    expect(toDateKey(endDateFor(parseDateKey('2026-08-30'), 7))).toBe('2026-09-05');
  });
});

describe('B2 — estimated period cost', () => {
  it('is the exact week total for a 7-day period, whichever day it starts', () => {
    for (const start of ['2026-08-10', '2026-08-13', '2026-08-16']) {
      expect(estimatePeriodCost(WEEK, parseDateKey(start), 7)).toBe(WEEK_TOTAL);
    }
  });

  it('depends on WHICH weekdays a partial period covers, not on an average', () => {
    // Monday to Wednesday: ₹100 + ₹200 + ₹300.
    expect(estimatePeriodCost(WEEK, parseDateKey('2026-08-10'), 3)).toBe(60_000n);
    // Friday to Sunday: ₹500 + ₹600 + ₹700 — more than double, same 3 days.
    expect(estimatePeriodCost(WEEK, parseDateKey('2026-08-14'), 3)).toBe(180_000n);
  });

  it('counts repeated weekdays in a 15-day period', () => {
    // 15 days from a Monday = two full weeks plus one extra Monday.
    const total = estimatePeriodCost(WEEK, parseDateKey('2026-08-10'), 15);
    expect(total).toBe(WEEK_TOTAL * 2n + 10_000n);
  });

  it('is four weeks plus two days for a 30-day period', () => {
    const total = estimatePeriodCost(WEEK, parseDateKey('2026-08-10'), 30);
    // 30 = 4×7 + 2, and those two extra days are Monday and Tuesday.
    expect(total).toBe(WEEK_TOTAL * 4n + 10_000n + 20_000n);
  });

  it('is zero when the plan has no days', () => {
    expect(estimatePeriodCost([], parseDateKey('2026-08-10'), 30)).toBe(0n);
  });

  it('averages the daily cost for the headline figure', () => {
    expect(averageDailyCost(WEEK)).toBe(40_000n); // ₹2,800 / 7 = ₹400
    expect(averageDailyCost([])).toBe(0n);
  });
});

describe('B2 — the plan fee', () => {
  const monthlyFeePaise = 9_900n; // ₹99

  it('waives the fee on the first 7-day trial plan', () => {
    const result = computePlanFee({
      monthlyFeePaise,
      durationDays: 7,
      isFirstPlan: true,
      trialDays: 7,
    });
    expect(result.feePaise).toBe(0n);
    expect(result.waived).toBe(true);
    expect(result.reason).toBe('FREE_TRIAL');
  });

  it('does NOT waive it on a first plan longer than the trial', () => {
    const result = computePlanFee({
      monthlyFeePaise,
      durationDays: 30,
      isFirstPlan: true,
      trialDays: 7,
    });
    expect(result.waived).toBe(false);
    expect(result.feePaise).toBe(9_900n);
  });

  it('charges the full monthly fee for 30 days', () => {
    expect(
      computePlanFee({ monthlyFeePaise, durationDays: 30, isFirstPlan: false, trialDays: 7 })
        .feePaise,
    ).toBe(9_900n);
  });

  it('prorates shorter durations rather than charging a full month', () => {
    // ₹99/month means ₹99/month. Charging it for one week would be four times
    // the rate the customer was quoted.
    expect(
      computePlanFee({ monthlyFeePaise, durationDays: 7, isFirstPlan: false, trialDays: 7 })
        .feePaise,
    ).toBe(2_300n); // ₹23.10 → ₹23

    expect(
      computePlanFee({ monthlyFeePaise, durationDays: 15, isFirstPlan: false, trialDays: 7 })
        .feePaise,
    ).toBe(5_000n); // ₹49.50 → ₹50
  });

  it('rounds the prorated fee to a whole rupee', () => {
    const fee = computePlanFee({
      monthlyFeePaise,
      durationDays: 15,
      isFirstPlan: false,
      trialDays: 7,
    }).feePaise;
    expect(fee % 100n).toBe(0n);
  });

  it('charges two months for a 60-day plan', () => {
    expect(
      computePlanFee({ monthlyFeePaise, durationDays: 60, isFirstPlan: false, trialDays: 7 })
        .feePaise,
    ).toBe(19_800n);
  });
});

describe('B3 — the prepayment', () => {
  it('is (period cost × 1.15) + plan fee', () => {
    const result = computePrepay({
      estimatedPeriodCostPaise: 100_000n, // ₹1,000
      planFeePaise: 9_900n, // ₹99
      bufferPercent: 15,
    });

    expect(result.bufferPaise).toBe(15_000n);
    expect(result.requiredBalancePaise).toBe(124_900n); // ₹1,249
  });

  it('adds no buffer at 0%', () => {
    const result = computePrepay({
      estimatedPeriodCostPaise: 100_000n,
      planFeePaise: 0n,
      bufferPercent: 0,
    });
    expect(result.bufferPaise).toBe(0n);
    expect(result.requiredBalancePaise).toBe(100_000n);
  });

  it('covers the free-trial case — buffer only, no fee', () => {
    const result = computePrepay({
      estimatedPeriodCostPaise: WEEK_TOTAL,
      planFeePaise: 0n,
      bufferPercent: 15,
    });
    expect(result.planFeePaise).toBe(0n);
    expect(result.requiredBalancePaise).toBe(322_000n); // ₹2,800 × 1.15
  });

  it('stays exact on a large period', () => {
    const result = computePrepay({
      estimatedPeriodCostPaise: 1_200_000n, // ₹12,000
      planFeePaise: 9_900n,
      bufferPercent: 15,
    });
    expect(result.requiredBalancePaise).toBe(1_389_900n);
  });
});

describe('B3 — the shortfall', () => {
  it('is the gap when the wallet is short', () => {
    expect(shortfallPaise(124_900n, 50_000n)).toBe(74_900n);
  });

  it('is zero when the wallet exactly covers it', () => {
    expect(shortfallPaise(124_900n, 124_900n)).toBe(0n);
  });

  it('never goes negative when the wallet is over', () => {
    // A customer with a large balance must not be shown "add −₹500 more".
    expect(shortfallPaise(124_900n, 500_000n)).toBe(0n);
  });
});

describe('a realistic 30-day approval', () => {
  it('produces the numbers the approval screen shows', () => {
    const start = parseDateKey('2026-08-12');
    const periodCost = estimatePeriodCost(WEEK, start, 30);

    const fee = computePlanFee({
      monthlyFeePaise: 9_900n,
      durationDays: 30,
      isFirstPlan: false,
      trialDays: 7,
    });

    const prepay = computePrepay({
      estimatedPeriodCostPaise: periodCost,
      planFeePaise: fee.feePaise,
      bufferPercent: 15,
    });

    expect(toDateKey(endDateFor(start, 30))).toBe('2026-09-10');
    expect(prepay.requiredBalancePaise).toBe(
      (periodCost * 115n) / 100n + 9_900n,
    );
    // Sanity: the whole thing is well inside a believable monthly grocery bill.
    expect(prepay.requiredBalancePaise).toBeGreaterThan(1_000_000n);
    expect(prepay.requiredBalancePaise).toBeLessThan(2_500_000n);
  });
});
