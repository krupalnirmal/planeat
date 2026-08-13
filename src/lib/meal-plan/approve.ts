import { db } from '@/lib/db';
import { ID_PREFIX, newId } from '@/lib/ids';
import { SETTING_KEYS, getSettingNumber, getSettingPaise } from '@/lib/settings';
import { LEDGER_REF, debit, getBalance } from '@/lib/wallet/ledger';
import type { DeliverySlot } from '@/generated/prisma/enums';
import {
  averageDailyCost,
  computePlanFee,
  computePrepay,
  endDateFor,
  estimatePeriodCost,
  parseDateKey,
  shortfallPaise,
  toDateKey,
  type PlanDayCost,
} from './pricing';

/**
 * M5 approval, B2's pricing and B3's prepayment.
 *
 *   "At plan approval the customer prepays (estimated period cost × 1.15) +
 *    plan fee into the wallet. Daily deliveries debit that balance."
 *
 * Read carefully, that is a REQUIRED BALANCE, not a charge. Only the plan fee
 * is debited at approval — it is payment for the service. The rest stays in the
 * wallet as the float the daily orders draw down, which is exactly what makes
 * the business get paid without thirty daily chances for a payment to fail.
 */

export interface ApprovalQuote {
  durationDays: number;
  startDate: string;
  endDate: string;
  estimatedDailyCostPaise: bigint;
  estimatedPeriodCostPaise: bigint;
  bufferPaise: bigint;
  planFeePaise: bigint;
  planFeeWaived: boolean;
  requiredBalancePaise: bigint;
  walletBalancePaise: bigint;
  shortfallPaise: bigint;
  canApprove: boolean;
  isFirstPlan: boolean;
  durationOptions: number[];
}

async function loadDayCosts(mealPlanId: string): Promise<PlanDayCost[]> {
  const days = await db.mealPlanDay.findMany({
    where: { mealPlanId },
    orderBy: { dayOfWeek: 'asc' },
    select: {
      dayOfWeek: true,
      items: { select: { variant: { select: { pricePaise: true } } } },
    },
  });

  return days.map((day) => ({
    dayOfWeek: day.dayOfWeek,
    costPaise: day.items.reduce((sum, item) => sum + (item.variant?.pricePaise ?? 0n), 0n),
  }));
}

/** B5 — the customer's first plan is the free 7-day trial. */
async function isFirstPlan(userId: string): Promise<boolean> {
  const previousSubscriptions = await db.subscription.count({ where: { userId } });
  return previousSubscriptions === 0;
}

export interface QuoteInput {
  mealPlanId: string;
  userId: string;
  durationDays?: number;
  startDate?: string;
}

export async function buildApprovalQuote(input: QuoteInput): Promise<ApprovalQuote | null> {
  const plan = await db.mealPlan.findUnique({
    where: { id: input.mealPlanId },
    select: { id: true, userId: true },
  });

  // R9 — ownership before anything else.
  if (!plan || plan.userId !== input.userId) return null;

  const [dayCosts, firstPlan, monthlyFeePaise, trialDays, defaultDuration, bufferPercent, options, balance] =
    await Promise.all([
      loadDayCosts(plan.id),
      isFirstPlan(input.userId),
      getSettingPaise(SETTING_KEYS.planFeePaise),
      getSettingNumber(SETTING_KEYS.mealPlanTrialDays),
      getSettingNumber(SETTING_KEYS.mealPlanDefaultDurationDays),
      getSettingNumber(SETTING_KEYS.walletPrepayBufferPercent),
      getSettingNumber(SETTING_KEYS.mealPlanTrialDays).then(() => [7, 15, 30]),
      getBalance(input.userId),
    ]);

  // B5 — first plan defaults to the 7-day trial; every plan after that to 30.
  const durationDays = input.durationDays ?? (firstPlan ? trialDays : defaultDuration);

  // Tomorrow by default: today's 00:30 generation window has already passed.
  const startDate = input.startDate
    ? parseDateKey(input.startDate)
    : parseDateKey(toDateKey(new Date(Date.now() + 86_400_000)));

  const estimatedPeriodCostPaise = estimatePeriodCost(dayCosts, startDate, durationDays);

  const planFee = computePlanFee({
    monthlyFeePaise,
    durationDays,
    isFirstPlan: firstPlan,
    trialDays,
  });

  const prepay = computePrepay({
    estimatedPeriodCostPaise,
    planFeePaise: planFee.feePaise,
    bufferPercent,
  });

  const shortfall = shortfallPaise(prepay.requiredBalancePaise, balance);

  return {
    durationDays,
    startDate: toDateKey(startDate),
    endDate: toDateKey(endDateFor(startDate, durationDays)),
    estimatedDailyCostPaise: averageDailyCost(dayCosts),
    estimatedPeriodCostPaise,
    bufferPaise: prepay.bufferPaise,
    planFeePaise: planFee.feePaise,
    planFeeWaived: planFee.waived,
    requiredBalancePaise: prepay.requiredBalancePaise,
    walletBalancePaise: balance,
    shortfallPaise: shortfall,
    canApprove: shortfall === 0n && dayCosts.length === 7,
    isFirstPlan: firstPlan,
    durationOptions: options,
  };
}

// ─────────────────────────────────────────────────────────────
// Approval
// ─────────────────────────────────────────────────────────────

export type ApproveFailure =
  | { reason: 'PLAN_NOT_FOUND' }
  | { reason: 'ADDRESS_NOT_FOUND' }
  | { reason: 'ALREADY_APPROVED'; subscriptionId: string }
  | { reason: 'INCOMPLETE_PLAN' }
  | {
      reason: 'INSUFFICIENT_BALANCE';
      requiredPaise: bigint;
      availablePaise: bigint;
      shortfallPaise: bigint;
    };

export type ApproveResult =
  | {
      ok: true;
      subscriptionId: string;
      startDate: string;
      endDate: string;
      planFeePaise: bigint;
      reservedPaise: bigint;
    }
  | ({ ok: false } & ApproveFailure);

export interface ApproveInput {
  mealPlanId: string;
  userId: string;
  addressId: string;
  durationDays: number;
  startDate: string;
  deliverySlot?: DeliverySlot;
}

export async function approveMealPlan(input: ApproveInput): Promise<ApproveResult> {
  const plan = await db.mealPlan.findUnique({
    where: { id: input.mealPlanId },
    select: { id: true, userId: true, status: true },
  });

  if (!plan || plan.userId !== input.userId) return { ok: false, reason: 'PLAN_NOT_FOUND' };

  // Idempotent: approving twice returns the subscription that already exists
  // rather than creating a second one and debiting the plan fee again.
  const existing = await db.subscription.findFirst({
    where: { mealPlanId: plan.id, status: { in: ['ACTIVE', 'PAUSED'] } },
    select: { id: true },
  });
  if (existing) return { ok: false, reason: 'ALREADY_APPROVED', subscriptionId: existing.id };

  const address = await db.address.findUnique({
    where: { id: input.addressId },
    select: { id: true, userId: true },
  });
  if (!address || address.userId !== input.userId) {
    return { ok: false, reason: 'ADDRESS_NOT_FOUND' };
  }

  const quote = await buildApprovalQuote({
    mealPlanId: plan.id,
    userId: input.userId,
    durationDays: input.durationDays,
    startDate: input.startDate,
  });

  if (!quote) return { ok: false, reason: 'PLAN_NOT_FOUND' };

  // A plan missing a day cannot become a subscription — Phase 6's cron would
  // generate nothing for that weekday and nobody would get vegetables.
  if (!quote.canApprove && quote.shortfallPaise === 0n) {
    return { ok: false, reason: 'INCOMPLETE_PLAN' };
  }

  // B3 — short balance at approval routes to top-up for the difference, then
  // returns here. Nothing is charged and no subscription is created.
  if (quote.shortfallPaise > 0n) {
    return {
      ok: false,
      reason: 'INSUFFICIENT_BALANCE',
      requiredPaise: quote.requiredBalancePaise,
      availablePaise: quote.walletBalancePaise,
      shortfallPaise: quote.shortfallPaise,
    };
  }

  const subscriptionId = newId(ID_PREFIX.subscription);

  await db.$transaction(async (tx) => {
    await tx.subscription.create({
      data: {
        id: subscriptionId,
        userId: input.userId,
        mealPlanId: plan.id,
        addressId: address.id,
        // B1 — one delivery per day, in a single morning slot, carrying both
        // the morning and evening vegetables.
        deliverySlot: input.deliverySlot ?? 'SUBSCRIPTION_0630_0900',
        startDate: parseDateKey(quote.startDate),
        endDate: parseDateKey(quote.endDate),
        status: 'ACTIVE',
        // B2 — vegetables are billed daily at the live price. FLAT stays in the
        // schema, unused.
        pricingMode: 'PER_DELIVERY',
        planFeePaise: quote.planFeePaise,
        // What the customer was asked to hold. Phase 6 draws the daily orders
        // from the wallet; this records what the estimate was at approval.
        prepaidPaise: quote.requiredBalancePaise - quote.planFeePaise,
        autoRenew: false,
      },
    });

    // B2 — the plan fee is a real charge for personalisation, unlimited swaps
    // and free delivery on plan days. Idempotent on the subscription id, so a
    // retried approval cannot charge it twice.
    if (quote.planFeePaise > 0n) {
      await debit(
        {
          userId: input.userId,
          amountPaise: quote.planFeePaise,
          source: 'PLAN_FEE',
          ...LEDGER_REF.planFee(subscriptionId),
          note: `Plan fee for ${quote.durationDays} days`,
        },
        tx,
      );
    }

    await tx.mealPlan.update({
      where: { id: plan.id },
      data: { status: 'ACTIVE', approvedAt: new Date() },
    });

    // Only one plan can be live at a time.
    await tx.mealPlan.updateMany({
      where: { userId: input.userId, id: { not: plan.id }, status: 'ACTIVE' },
      data: { status: 'SUPERSEDED' },
    });
  });

  return {
    ok: true,
    subscriptionId,
    startDate: quote.startDate,
    endDate: quote.endDate,
    planFeePaise: quote.planFeePaise,
    reservedPaise: quote.requiredBalancePaise - quote.planFeePaise,
  };
}
