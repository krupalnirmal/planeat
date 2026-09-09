import { db } from '@/lib/db';
import { ID_PREFIX, newId } from '@/lib/ids';
import { SETTING_KEYS, getSettingNumber, getSettingPaise } from '@/lib/settings';
import { InsufficientBalanceError, LEDGER_REF, debit, getBalance } from '@/lib/wallet/ledger';
import { getPlanDayCosts } from './queries';
import {
  averageDailyCost,
  computePlanFee,
  computePrepay,
  endDateFor,
  estimatePeriodCost,
  parseDateKey,
  shortfallPaise,
  type PlanFeeResult,
  type PrepayBreakdown,
} from './pricing';

/**
 * The missing Phase 5: turning a saved "My Meal Plan" into a real,
 * wallet-billed subscription. Every number here comes from `pricing.ts`
 * (already built, pure, unit-tested) — this module's only job is wiring it
 * to the customer's real plan, real wallet balance, and the `Subscription`
 * row `src/lib/subscription/generate-orders.ts` has been reading from since
 * before anything ever created one.
 */

export interface QuoteResult {
  averageDailyPaise: bigint;
  estimatedPeriodCostPaise: bigint;
  planFee: PlanFeeResult;
  prepay: PrepayBreakdown;
  walletBalancePaise: bigint;
  shortfallPaise: bigint;
}

async function isFirstSubscription(userId: string): Promise<boolean> {
  const count = await db.subscription.count({ where: { userId } });
  return count === 0;
}

/** Everything the "review & approve" screen renders — all server-computed,
    never trusted from the client. */
export async function getSubscriptionQuote(
  userId: string,
  mealPlanId: string,
  durationDays: number,
  startDateKey: string,
): Promise<QuoteResult> {
  const startDate = parseDateKey(startDateKey);

  const [dayCosts, monthlyFeePaise, trialDays, bufferPercent, balance, firstPlan] = await Promise.all([
    getPlanDayCosts(mealPlanId),
    getSettingPaise(SETTING_KEYS.planFeePaise),
    getSettingNumber(SETTING_KEYS.mealPlanTrialDays),
    getSettingNumber(SETTING_KEYS.walletPrepayBufferPercent),
    getBalance(userId),
    isFirstSubscription(userId),
  ]);

  const estimatedPeriodCostPaise = estimatePeriodCost(dayCosts, startDate, durationDays);
  const averageDailyPaise = averageDailyCost(dayCosts);
  const planFee = computePlanFee({ monthlyFeePaise, durationDays, isFirstPlan: firstPlan, trialDays });
  const prepay = computePrepay({
    estimatedPeriodCostPaise,
    planFeePaise: planFee.feePaise,
    bufferPercent,
  });

  return {
    averageDailyPaise,
    estimatedPeriodCostPaise,
    planFee,
    prepay,
    walletBalancePaise: balance,
    shortfallPaise: shortfallPaise(prepay.requiredBalancePaise, balance),
  };
}

export interface ActivateInput {
  addressId: string;
  durationDays: number;
  startDateKey: string;
}

export type ActivateResult =
  | { ok: true; subscriptionId: string }
  | {
      ok: false;
      reason: 'NO_PLAN' | 'EMPTY_PLAN' | 'ALREADY_ACTIVE' | 'ADDRESS_NOT_FOUND' | 'INSUFFICIENT_BALANCE';
      shortfallPaise?: bigint;
    };

/**
 * Re-checks everything the quote already showed the customer — a quote is a
 * preview, not a lock, and prices/balance can move between viewing it and
 * tapping Activate. Only the plan fee is actually charged here (matches
 * `computePrepay`'s own doc: the buffer stays in the wallet and is drawn
 * down by daily deliveries, not charged up front).
 */
export async function activateSubscription(userId: string, input: ActivateInput): Promise<ActivateResult> {
  const plan = await db.mealPlan.findFirst({
    where: { userId, generatedBy: 'CUSTOMER' },
    orderBy: { version: 'desc' },
    select: { id: true, days: { select: { items: { select: { id: true }, take: 1 } } } },
  });
  if (!plan) return { ok: false, reason: 'NO_PLAN' };
  if (!plan.days.some((day) => day.items.length > 0)) return { ok: false, reason: 'EMPTY_PLAN' };

  const alreadyActive = await db.subscription.findFirst({
    where: { userId, status: { in: ['ACTIVE', 'PAUSED'] } },
    select: { id: true },
  });
  if (alreadyActive) return { ok: false, reason: 'ALREADY_ACTIVE' };

  const address = await db.address.findUnique({
    where: { id: input.addressId },
    select: { userId: true },
  });
  if (!address || address.userId !== userId) return { ok: false, reason: 'ADDRESS_NOT_FOUND' };

  const quote = await getSubscriptionQuote(userId, plan.id, input.durationDays, input.startDateKey);
  if (quote.shortfallPaise > 0n) {
    return { ok: false, reason: 'INSUFFICIENT_BALANCE', shortfallPaise: quote.shortfallPaise };
  }

  const startDate = parseDateKey(input.startDateKey);
  const endDate = endDateFor(startDate, input.durationDays);
  const subscriptionId = newId(ID_PREFIX.subscription);

  try {
    await db.$transaction(
      async (tx) => {
        if (quote.planFee.feePaise > 0n) {
          await debit(
            {
              userId,
              amountPaise: quote.planFee.feePaise,
              source: 'PLAN_FEE',
              ...LEDGER_REF.planFee(subscriptionId),
              note: `Plan fee — ${input.durationDays}-day subscription`,
            },
            tx,
          );
        }

        await tx.subscription.create({
          data: {
            id: subscriptionId,
            userId,
            mealPlanId: plan.id,
            addressId: input.addressId,
            deliverySlot: 'SUBSCRIPTION_0630_0900',
            startDate,
            endDate,
            status: 'ACTIVE',
            pricingMode: 'PER_DELIVERY',
            planFeePaise: quote.planFee.feePaise,
            // Informational snapshot of what was required at approval, not
            // a second charge — the buffer itself stays in the wallet.
            prepaidPaise: quote.prepay.requiredBalancePaise,
          },
        });
      },
      { timeout: 15_000 },
    );
  } catch (error) {
    if (error instanceof InsufficientBalanceError) {
      return {
        ok: false,
        reason: 'INSUFFICIENT_BALANCE',
        shortfallPaise: error.requiredPaise - error.availablePaise,
      };
    }
    throw error;
  }

  return { ok: true, subscriptionId };
}
