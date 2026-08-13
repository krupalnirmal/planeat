import { db } from '@/lib/db';
import { env } from '@/lib/env';

/**
 * R8 — no hard-coded business numbers.
 *
 * Every fee, threshold, portion size, duration and limit is read from the
 * `app_settings` table so the owner can change it from the admin panel without
 * a deploy. The `env.defaults` values are bootstrap seeds only: they populate
 * the table on first run and act as the last-resort fallback if a row is
 * missing.
 *
 * Reads are cached in-process for SETTINGS_TTL_MS. Admin writes call
 * `invalidateSettingsCache()`.
 */

export const SETTING_KEYS = {
  minOrderValuePaise: 'pricing.min_order_value_paise',
  deliveryFeePaise: 'pricing.delivery_fee_paise',
  freeDeliveryThresholdPaise: 'pricing.free_delivery_threshold_paise',
  handlingFeePaise: 'pricing.handling_fee_paise',
  planFeePaise: 'pricing.plan_fee_paise',
  lowWalletThresholdPaise: 'wallet.low_balance_threshold_paise',
  codMaxOrderPaise: 'pricing.cod_max_order_paise',
  complaintAutoCreditMaxPaise: 'support.complaint_auto_credit_max_paise',
  complaintAutoCreditMonthlyLimit: 'support.complaint_auto_credit_monthly_limit',

  mealPlanTrialDays: 'meal_plan.trial_days',
  mealPlanDefaultDurationDays: 'meal_plan.default_duration_days',
  mealPlanDurationOptions: 'meal_plan.duration_options',
  mealPlanRefreshPromptWeeks: 'meal_plan.refresh_prompt_weeks',
  servingGramsPerAdult: 'meal_plan.serving_grams_per_adult',
  childServingMultiplier: 'meal_plan.child_serving_multiplier',
  quantityRoundingGrams: 'meal_plan.quantity_rounding_grams',
  quantityMinGrams: 'meal_plan.quantity_min_grams',
  quantityMaxGrams: 'meal_plan.quantity_max_grams',
  maxSwapsPerPlanPerWeek: 'meal_plan.max_swaps_per_week',
  walletPrepayBufferPercent: 'meal_plan.wallet_prepay_buffer_percent',

  subscriptionSlot: 'delivery.subscription_slot',
  serviceRadiusMeters: 'delivery.service_radius_meters',
  skipCutoffHour: 'delivery.skip_cutoff_hour',

  featureCod: 'feature.cod',
  featureAdminSwapApproval: 'feature.admin_swap_approval',
  featureAutoSubstitute: 'feature.auto_substitute',
  featureSmartList: 'feature.smart_list',
  featureVoiceList: 'feature.voice_list',
  featurePhotoList: 'feature.photo_list',
} as const;

export type SettingKey = (typeof SETTING_KEYS)[keyof typeof SETTING_KEYS];

/** Groups drive the admin Settings page layout. */
export const SETTING_GROUPS: Record<SettingKey, string> = {
  [SETTING_KEYS.minOrderValuePaise]: 'pricing',
  [SETTING_KEYS.deliveryFeePaise]: 'pricing',
  [SETTING_KEYS.freeDeliveryThresholdPaise]: 'pricing',
  [SETTING_KEYS.handlingFeePaise]: 'pricing',
  [SETTING_KEYS.planFeePaise]: 'pricing',
  [SETTING_KEYS.lowWalletThresholdPaise]: 'wallet',
  [SETTING_KEYS.codMaxOrderPaise]: 'pricing',
  [SETTING_KEYS.complaintAutoCreditMaxPaise]: 'support',
  [SETTING_KEYS.complaintAutoCreditMonthlyLimit]: 'support',
  [SETTING_KEYS.mealPlanTrialDays]: 'meal_plan',
  [SETTING_KEYS.mealPlanDefaultDurationDays]: 'meal_plan',
  [SETTING_KEYS.mealPlanDurationOptions]: 'meal_plan',
  [SETTING_KEYS.mealPlanRefreshPromptWeeks]: 'meal_plan',
  [SETTING_KEYS.servingGramsPerAdult]: 'meal_plan',
  [SETTING_KEYS.childServingMultiplier]: 'meal_plan',
  [SETTING_KEYS.quantityRoundingGrams]: 'meal_plan',
  [SETTING_KEYS.quantityMinGrams]: 'meal_plan',
  [SETTING_KEYS.quantityMaxGrams]: 'meal_plan',
  [SETTING_KEYS.maxSwapsPerPlanPerWeek]: 'meal_plan',
  [SETTING_KEYS.walletPrepayBufferPercent]: 'meal_plan',
  [SETTING_KEYS.subscriptionSlot]: 'delivery',
  [SETTING_KEYS.serviceRadiusMeters]: 'delivery',
  [SETTING_KEYS.skipCutoffHour]: 'delivery',
  [SETTING_KEYS.featureCod]: 'feature',
  [SETTING_KEYS.featureAdminSwapApproval]: 'feature',
  [SETTING_KEYS.featureAutoSubstitute]: 'feature',
  [SETTING_KEYS.featureSmartList]: 'feature',
  [SETTING_KEYS.featurePhotoList]: 'feature',
  [SETTING_KEYS.featureVoiceList]: 'feature',
};

/** Bootstrap values — seeded into app_settings, and the fallback if a row is missing. */
export function bootstrapSettings(): Record<SettingKey, unknown> {
  const d = env.defaults;
  const f = env.features;
  return {
    [SETTING_KEYS.minOrderValuePaise]: d.minOrderValuePaise,
    [SETTING_KEYS.deliveryFeePaise]: d.deliveryFeePaise,
    [SETTING_KEYS.freeDeliveryThresholdPaise]: d.freeDeliveryThresholdPaise,
    [SETTING_KEYS.handlingFeePaise]: d.handlingFeePaise,
    [SETTING_KEYS.planFeePaise]: d.planFeePaise,
    [SETTING_KEYS.lowWalletThresholdPaise]: d.lowWalletThresholdPaise,
    [SETTING_KEYS.codMaxOrderPaise]: d.codMaxOrderPaise,
    [SETTING_KEYS.complaintAutoCreditMaxPaise]: d.complaintAutoCreditMaxPaise,
    [SETTING_KEYS.complaintAutoCreditMonthlyLimit]: d.complaintAutoCreditMonthlyLimit,
    [SETTING_KEYS.mealPlanTrialDays]: d.mealPlanTrialDays,
    [SETTING_KEYS.mealPlanDefaultDurationDays]: d.mealPlanDefaultDurationDays,
    [SETTING_KEYS.mealPlanDurationOptions]: d.mealPlanDurationOptions,
    [SETTING_KEYS.mealPlanRefreshPromptWeeks]: d.mealPlanRefreshPromptWeeks,
    [SETTING_KEYS.servingGramsPerAdult]: d.servingGramsPerAdult,
    [SETTING_KEYS.childServingMultiplier]: d.childServingMultiplier,
    [SETTING_KEYS.quantityRoundingGrams]: d.quantityRoundingGrams,
    [SETTING_KEYS.quantityMinGrams]: d.quantityMinGrams,
    [SETTING_KEYS.quantityMaxGrams]: d.quantityMaxGrams,
    [SETTING_KEYS.maxSwapsPerPlanPerWeek]: d.maxSwapsPerPlanPerWeek,
    [SETTING_KEYS.walletPrepayBufferPercent]: d.walletPrepayBufferPercent,
    [SETTING_KEYS.subscriptionSlot]: d.subscriptionSlot,
    [SETTING_KEYS.serviceRadiusMeters]: d.serviceRadiusMeters,
    [SETTING_KEYS.skipCutoffHour]: d.skipCutoffHour,
    [SETTING_KEYS.featureCod]: f.cod,
    [SETTING_KEYS.featureAdminSwapApproval]: f.adminSwapApproval,
    [SETTING_KEYS.featureAutoSubstitute]: f.autoSubstitute,
    [SETTING_KEYS.featureSmartList]: f.smartList,
    [SETTING_KEYS.featureVoiceList]: f.voiceList,
    [SETTING_KEYS.featurePhotoList]: f.photoList,
  };
}

const SETTINGS_TTL_MS = 60_000;

let cache: { values: Map<string, unknown>; loadedAt: number } | null = null;

export function invalidateSettingsCache(): void {
  cache = null;
}

async function loadSettings(): Promise<Map<string, unknown>> {
  if (cache && Date.now() - cache.loadedAt < SETTINGS_TTL_MS) {
    return cache.values;
  }
  const values = new Map<string, unknown>();
  try {
    const rows = await db.appSetting.findMany({ select: { key: true, value: true } });
    for (const row of rows) values.set(row.key, row.value);
  } catch {
    // No database yet (fresh clone, first `next dev`) — fall through to
    // bootstrap defaults rather than crashing the page.
  }
  cache = { values, loadedAt: Date.now() };
  return values;
}

async function raw(key: SettingKey): Promise<unknown> {
  const values = await loadSettings();
  return values.has(key) ? values.get(key) : bootstrapSettings()[key];
}

export async function getSettingNumber(key: SettingKey): Promise<number> {
  const v = await raw(key);
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Money settings are stored as plain integers (paise) and read back as BigInt. */
export async function getSettingPaise(key: SettingKey): Promise<bigint> {
  return BigInt(Math.round(await getSettingNumber(key)));
}

export async function getSettingBoolean(key: SettingKey): Promise<boolean> {
  const v = await raw(key);
  return v === true || v === 'true' || v === 1;
}

export async function getSettingString(key: SettingKey): Promise<string> {
  const v = await raw(key);
  return typeof v === 'string' ? v : String(v ?? '');
}

export async function getSettingNumberList(key: SettingKey): Promise<number[]> {
  const v = await raw(key);
  if (Array.isArray(v)) return v.map(Number).filter(Number.isFinite);
  return [];
}

export async function getAllSettings(): Promise<Record<string, unknown>> {
  const values = await loadSettings();
  return { ...bootstrapSettings(), ...Object.fromEntries(values) };
}
