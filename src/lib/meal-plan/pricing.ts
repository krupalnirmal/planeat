import { addPercent } from '@/lib/money';

/**
 * B2 and B3 — what the customer is asked to pay at approval.
 *
 * Every function here is pure so the arithmetic can be pinned by tests. The
 * numbers themselves come from `app_settings` (R8) and are passed in.
 *
 * B2 — vegetables are billed DAILY at the live catalogue price. Nothing here
 * is a price the customer is locked into; it is an estimate, and the approval
 * screen has to say so plainly. A flat all-inclusive price is a trap: Indian
 * vegetable prices are volatile enough that one tomato spike would make every
 * subscriber loss-making at once.
 */

/** 1 = Monday … 7 = Sunday, matching `meal_plan_days.day_of_week`. */
export type WeekdayNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7;

/** B5 — the only durations offered. */
export const DURATION_OPTIONS = [7, 15, 30] as const;
export type DurationDays = (typeof DURATION_OPTIONS)[number];

/**
 * Treats a `YYYY-MM-DD` string as a calendar date with no timezone attached.
 *
 * The whole business runs on IST calendar days — the 00:30 generation window,
 * the delivery slot, the skip cutoff. Doing this arithmetic on a local `Date`
 * would shift the plan by a day for anyone whose server is not in IST.
 */
export function parseDateKey(dateKey: string): Date {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

export function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

/** JS `getUTCDay()` is 0=Sunday; the schema is 1=Monday…7=Sunday. */
export function weekdayNumber(date: Date): WeekdayNumber {
  const day = date.getUTCDay();
  return (day === 0 ? 7 : day) as WeekdayNumber;
}

/** B5 — a period of `durationDays` starting on `startDate`, inclusive. */
export function endDateFor(startDate: Date, durationDays: number): Date {
  return addDays(startDate, durationDays - 1);
}

// ─────────────────────────────────────────────────────────────
// Cost
// ─────────────────────────────────────────────────────────────

export interface PlanDayCost {
  dayOfWeek: number;
  /** Sum of the day's two items at today's catalogue price. */
  costPaise: bigint;
}

/**
 * The plan is a weekly TEMPLATE that repeats (B5), so the period cost is not
 * "daily average × days" — it depends on which weekdays the period actually
 * covers. A 15-day period starting on a Wednesday contains three Wednesdays
 * and two Mondays, and if Wednesday is the expensive day that matters.
 */
export function estimatePeriodCost(
  dayCosts: readonly PlanDayCost[],
  startDate: Date,
  durationDays: number,
): bigint {
  const byWeekday = new Map<number, bigint>();
  for (const day of dayCosts) byWeekday.set(day.dayOfWeek, day.costPaise);

  let total = 0n;
  for (let offset = 0; offset < durationDays; offset++) {
    const date = addDays(startDate, offset);
    total += byWeekday.get(weekdayNumber(date)) ?? 0n;
  }
  return total;
}

/** The plain daily average, for the headline figure on the approval screen. */
export function averageDailyCost(dayCosts: readonly PlanDayCost[]): bigint {
  if (dayCosts.length === 0) return 0n;
  const total = dayCosts.reduce((sum, day) => sum + day.costPaise, 0n);
  return total / BigInt(dayCosts.length);
}

// ─────────────────────────────────────────────────────────────
// Plan fee (B2)
// ─────────────────────────────────────────────────────────────

const DAYS_PER_MONTH = 30;

export interface PlanFeeInput {
  /** ₹99/month, from app_settings. */
  monthlyFeePaise: bigint;
  durationDays: number;
  /** B5 — the customer's first plan defaults to a 7-day free trial. */
  isFirstPlan: boolean;
  trialDays: number;
}

export interface PlanFeeResult {
  feePaise: bigint;
  waived: boolean;
  reason: 'FREE_TRIAL' | null;
}

/**
 * B2 — "₹99/month plan fee … The first 7-day trial plan has no plan fee."
 *
 * The brief prices the fee per month and offers 7/15/30-day durations, so
 * anything shorter than a month is charged pro-rata. Charging a full ₹99 for
 * one week would be four times the monthly rate, which is not what "₹99/month"
 * means to the person reading it.
 */
export function computePlanFee(input: PlanFeeInput): PlanFeeResult {
  if (input.isFirstPlan && input.durationDays <= input.trialDays) {
    return { feePaise: 0n, waived: true, reason: 'FREE_TRIAL' };
  }

  if (input.durationDays >= DAYS_PER_MONTH) {
    const months = BigInt(Math.ceil(input.durationDays / DAYS_PER_MONTH));
    return { feePaise: input.monthlyFeePaise * months, waived: false, reason: null };
  }

  // Pro-rata, rounded to the nearest whole rupee so the bill has no stray paise.
  const exact = (input.monthlyFeePaise * BigInt(input.durationDays)) / BigInt(DAYS_PER_MONTH);
  const rounded = ((exact + 50n) / 100n) * 100n;
  return { feePaise: rounded, waived: false, reason: null };
}

// ─────────────────────────────────────────────────────────────
// B3 — the prepayment
// ─────────────────────────────────────────────────────────────

export interface PrepayInput {
  estimatedPeriodCostPaise: bigint;
  planFeePaise: bigint;
  /** WALLET_PREPAY_BUFFER_PERCENT, 15 by default. */
  bufferPercent: number;
}

export interface PrepayBreakdown {
  estimatedPeriodCostPaise: bigint;
  bufferPaise: bigint;
  planFeePaise: bigint;
  /** What the wallet must hold before the subscription can start. */
  requiredBalancePaise: bigint;
}

/**
 * B3 — "(estimated period cost × 1.15) + plan fee".
 *
 * The buffer exists because B2 bills at the live daily price: without it, one
 * week of expensive tomatoes leaves every subscriber short mid-period, and the
 * order for that morning holds as PAYMENT_PENDING.
 *
 * Note this is a REQUIRED BALANCE, not a charge. The plan fee is debited at
 * approval; the rest stays in the wallet and is drawn down by the daily
 * deliveries.
 */
export function computePrepay(input: PrepayInput): PrepayBreakdown {
  const withBuffer = addPercent(input.estimatedPeriodCostPaise, input.bufferPercent);

  return {
    estimatedPeriodCostPaise: input.estimatedPeriodCostPaise,
    bufferPaise: withBuffer - input.estimatedPeriodCostPaise,
    planFeePaise: input.planFeePaise,
    requiredBalancePaise: withBuffer + input.planFeePaise,
  };
}

/** How much more the customer needs before they can approve. Zero when covered. */
export function shortfallPaise(requiredPaise: bigint, balancePaise: bigint): bigint {
  const gap = requiredPaise - balancePaise;
  return gap > 0n ? gap : 0n;
}
