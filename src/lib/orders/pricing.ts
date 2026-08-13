import { SETTING_KEYS, getSettingBoolean, getSettingPaise } from '@/lib/settings';
import type { OrderType, PaymentMethod } from '@/generated/prisma/enums';

/**
 * Bill computation (M3, B9, B10).
 *
 * R8 — every number here comes from `app_settings`, so the owner can change a
 * fee from the admin panel without a deploy. Nothing in this file is a
 * literal.
 *
 * R4 — all arithmetic is on BigInt paise. A float here would show ₹148.99999
 * on a bill at some point, and that is the kind of bug customers photograph.
 */

export interface FeeConfig {
  minOrderValuePaise: bigint;
  deliveryFeePaise: bigint;
  freeDeliveryThresholdPaise: bigint;
  handlingFeePaise: bigint;
  codMaxOrderPaise: bigint;
  codEnabled: boolean;
}

export async function loadFeeConfig(): Promise<FeeConfig> {
  const [
    minOrderValuePaise,
    deliveryFeePaise,
    freeDeliveryThresholdPaise,
    handlingFeePaise,
    codMaxOrderPaise,
    codEnabled,
  ] = await Promise.all([
    getSettingPaise(SETTING_KEYS.minOrderValuePaise),
    getSettingPaise(SETTING_KEYS.deliveryFeePaise),
    getSettingPaise(SETTING_KEYS.freeDeliveryThresholdPaise),
    getSettingPaise(SETTING_KEYS.handlingFeePaise),
    getSettingPaise(SETTING_KEYS.codMaxOrderPaise),
    getSettingBoolean(SETTING_KEYS.featureCod),
  ]);

  return {
    minOrderValuePaise,
    deliveryFeePaise,
    freeDeliveryThresholdPaise,
    handlingFeePaise,
    codMaxOrderPaise,
    codEnabled,
  };
}

export interface BillInput {
  itemTotalPaise: bigint;
  orderType: OrderType;
  discountPaise?: bigint;
  /** Overrides the global fee, e.g. a service area with its own rate. */
  areaDeliveryFeePaise?: bigint | null;
  areaFreeDeliveryThresholdPaise?: bigint | null;
}

export interface Bill {
  itemTotalPaise: bigint;
  deliveryFeePaise: bigint;
  handlingFeePaise: bigint;
  discountPaise: bigint;
  totalPaise: bigint;

  /** B10 — the "add ₹X more for free delivery" nudge. Zero once earned. */
  amountForFreeDeliveryPaise: bigint;
  freeDeliveryThresholdPaise: bigint;
  minOrderValuePaise: bigint;
  meetsMinimum: boolean;

  availablePaymentMethods: PaymentMethod[];
  codUnavailableReason: 'DISABLED' | 'MEAL_PLAN' | 'ABOVE_CAP' | null;
  /** Echoed so the UI can say "cash is not available above ₹1,500". */
  codMaxOrderPaise: bigint;
}

/**
 * B10 — instant orders pay ₹25 below ₹299 and nothing at or above it.
 * Meal-plan deliveries are always free (B2: the ₹99 plan fee covers it).
 */
export function computeBill(input: BillInput, config: FeeConfig): Bill {
  const discountPaise = input.discountPaise ?? 0n;
  const isMealPlan = input.orderType === 'MEAL_PLAN_DAILY';

  const threshold = input.areaFreeDeliveryThresholdPaise ?? config.freeDeliveryThresholdPaise;
  const baseDeliveryFee = input.areaDeliveryFeePaise ?? config.deliveryFeePaise;

  const deliveryFeePaise = isMealPlan
    ? 0n
    : input.itemTotalPaise >= threshold
      ? 0n
      : baseDeliveryFee;

  // B10 — the handling fee is ₹0 and the brief says not to add one. It stays
  // in the model because the schema and the bill both have a slot for it.
  const handlingFeePaise = config.handlingFeePaise;

  const totalPaise =
    input.itemTotalPaise + deliveryFeePaise + handlingFeePaise - discountPaise;

  const amountForFreeDeliveryPaise =
    isMealPlan || input.itemTotalPaise >= threshold ? 0n : threshold - input.itemTotalPaise;

  const meetsMinimum = isMealPlan || input.itemTotalPaise >= config.minOrderValuePaise;

  // B9 — COD exists for instant orders only, capped at ₹1,500. On a daily
  // recurring delivery it would make cash reconciliation the owner's second
  // job, so checkout does not offer it at all.
  let codUnavailableReason: Bill['codUnavailableReason'] = null;
  if (!config.codEnabled) codUnavailableReason = 'DISABLED';
  else if (isMealPlan) codUnavailableReason = 'MEAL_PLAN';
  else if (totalPaise > config.codMaxOrderPaise) codUnavailableReason = 'ABOVE_CAP';

  const availablePaymentMethods: PaymentMethod[] = ['WALLET', 'RAZORPAY'];
  if (codUnavailableReason === null) availablePaymentMethods.push('COD');

  return {
    itemTotalPaise: input.itemTotalPaise,
    deliveryFeePaise,
    handlingFeePaise,
    discountPaise,
    totalPaise: totalPaise > 0n ? totalPaise : 0n,
    amountForFreeDeliveryPaise,
    freeDeliveryThresholdPaise: threshold,
    minOrderValuePaise: config.minOrderValuePaise,
    meetsMinimum,
    availablePaymentMethods,
    codUnavailableReason,
    codMaxOrderPaise: config.codMaxOrderPaise,
  };
}

export function isPaymentMethodAllowed(bill: Bill, method: PaymentMethod): boolean {
  return bill.availablePaymentMethods.includes(method);
}
