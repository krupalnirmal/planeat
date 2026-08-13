import { db } from '@/lib/db';
import {
  SETTING_GROUPS,
  SETTING_KEYS,
  bootstrapSettings,
  invalidateSettingsCache,
} from '@/lib/settings';
import { audit } from './audit';

/**
 * M9 — "Settings: every value from Part 9, editable at runtime."
 *
 * R8 is the rule this screen exists to satisfy: no hard-coded business
 * numbers. The owner changes the delivery fee from here, not from a deploy.
 *
 * Two safeguards, because these values move real money:
 *   - every write is audited with before and after
 *   - the in-process cache is invalidated immediately, so the next order is
 *     priced with the new number rather than up to 60 seconds of the old one
 */

export type SettingType = 'paise' | 'number' | 'boolean' | 'string' | 'number-list';

export interface SettingDescriptor {
  key: string;
  group: string;
  type: SettingType;
  /** Which brief rule this number comes from, shown in the admin UI. */
  reference: string;
}

/**
 * The type of each setting, so the form renders a rupee field for money and a
 * toggle for a flag — and so a string can never be saved into a fee.
 */
export const SETTING_DESCRIPTORS: SettingDescriptor[] = [
  { key: SETTING_KEYS.minOrderValuePaise, group: 'pricing', type: 'paise', reference: 'B10' },
  { key: SETTING_KEYS.deliveryFeePaise, group: 'pricing', type: 'paise', reference: 'B10' },
  {
    key: SETTING_KEYS.freeDeliveryThresholdPaise,
    group: 'pricing',
    type: 'paise',
    reference: 'B10',
  },
  { key: SETTING_KEYS.handlingFeePaise, group: 'pricing', type: 'paise', reference: 'B10' },
  { key: SETTING_KEYS.planFeePaise, group: 'pricing', type: 'paise', reference: 'B2' },
  { key: SETTING_KEYS.codMaxOrderPaise, group: 'pricing', type: 'paise', reference: 'B9' },

  { key: SETTING_KEYS.lowWalletThresholdPaise, group: 'wallet', type: 'paise', reference: 'B10' },

  {
    key: SETTING_KEYS.complaintAutoCreditMaxPaise,
    group: 'support',
    type: 'paise',
    reference: 'B14',
  },
  {
    key: SETTING_KEYS.complaintAutoCreditMonthlyLimit,
    group: 'support',
    type: 'number',
    reference: 'B14',
  },

  { key: SETTING_KEYS.mealPlanTrialDays, group: 'meal_plan', type: 'number', reference: 'B5' },
  {
    key: SETTING_KEYS.mealPlanDefaultDurationDays,
    group: 'meal_plan',
    type: 'number',
    reference: 'B5',
  },
  {
    key: SETTING_KEYS.mealPlanDurationOptions,
    group: 'meal_plan',
    type: 'number-list',
    reference: 'B5',
  },
  {
    key: SETTING_KEYS.mealPlanRefreshPromptWeeks,
    group: 'meal_plan',
    type: 'number',
    reference: 'B5',
  },
  { key: SETTING_KEYS.servingGramsPerAdult, group: 'meal_plan', type: 'number', reference: 'B4' },
  {
    key: SETTING_KEYS.childServingMultiplier,
    group: 'meal_plan',
    type: 'number',
    reference: 'B4',
  },
  { key: SETTING_KEYS.quantityRoundingGrams, group: 'meal_plan', type: 'number', reference: 'B4' },
  { key: SETTING_KEYS.quantityMinGrams, group: 'meal_plan', type: 'number', reference: 'B4' },
  { key: SETTING_KEYS.quantityMaxGrams, group: 'meal_plan', type: 'number', reference: 'B4' },
  {
    key: SETTING_KEYS.maxSwapsPerPlanPerWeek,
    group: 'meal_plan',
    type: 'number',
    reference: 'B6',
  },
  {
    key: SETTING_KEYS.walletPrepayBufferPercent,
    group: 'meal_plan',
    type: 'number',
    reference: 'B3',
  },

  { key: SETTING_KEYS.subscriptionSlot, group: 'delivery', type: 'string', reference: 'B1' },
  { key: SETTING_KEYS.serviceRadiusMeters, group: 'delivery', type: 'number', reference: 'B11' },
  { key: SETTING_KEYS.skipCutoffHour, group: 'delivery', type: 'number', reference: 'M6' },

  { key: SETTING_KEYS.featureCod, group: 'feature', type: 'boolean', reference: 'B9' },
  {
    key: SETTING_KEYS.featureAdminSwapApproval,
    group: 'feature',
    type: 'boolean',
    reference: 'B6',
  },
  { key: SETTING_KEYS.featureAutoSubstitute, group: 'feature', type: 'boolean', reference: 'B7' },
  { key: SETTING_KEYS.featureSmartList, group: 'feature', type: 'boolean', reference: 'M4' },
  { key: SETTING_KEYS.featureVoiceList, group: 'feature', type: 'boolean', reference: 'M4' },
  { key: SETTING_KEYS.featurePhotoList, group: 'feature', type: 'boolean', reference: 'M4' },
];

const DESCRIPTOR_BY_KEY = new Map(SETTING_DESCRIPTORS.map((entry) => [entry.key, entry]));

export interface SettingView extends SettingDescriptor {
  value: unknown;
  /** True when nobody has ever changed it from the bootstrap default. */
  isDefault: boolean;
  updatedAt: Date | null;
  updatedByName: string | null;
}

export async function listSettings(): Promise<SettingView[]> {
  const rows = await db.appSetting.findMany({
    select: { key: true, value: true, updatedAt: true, updatedBy: true },
  });

  const stored = new Map(rows.map((row) => [row.key, row]));
  const defaults = bootstrapSettings();

  const actorIds = [
    ...new Set(rows.map((row) => row.updatedBy).filter((id): id is string => id !== null)),
  ];
  const actors =
    actorIds.length > 0
      ? await db.user.findMany({
          where: { id: { in: actorIds } },
          select: { id: true, name: true, phone: true },
        })
      : [];
  const actorById = new Map(actors.map((actor) => [actor.id, actor.name ?? actor.phone]));

  return SETTING_DESCRIPTORS.map((descriptor) => {
    const row = stored.get(descriptor.key);
    return {
      ...descriptor,
      value: row ? row.value : (defaults as Record<string, unknown>)[descriptor.key],
      isDefault: row === undefined,
      updatedAt: row?.updatedAt ?? null,
      updatedByName: row?.updatedBy ? (actorById.get(row.updatedBy) ?? null) : null,
    };
  });
}

export type SettingWriteResult =
  | { ok: true }
  | { ok: false; reason: 'UNKNOWN_KEY' | 'WRONG_TYPE'; detail?: string };

/**
 * Coerces and validates against the descriptor's declared type.
 *
 * Without this, a fee could be saved as the string "twenty five" and every
 * subsequent bill would silently compute as zero — the kind of failure that
 * shows up in the accounts a month later.
 */
function coerce(type: SettingType, raw: unknown): { ok: true; value: unknown } | { ok: false } {
  switch (type) {
    case 'paise':
    case 'number': {
      const value = typeof raw === 'number' ? raw : Number(raw);
      if (!Number.isFinite(value) || value < 0) return { ok: false };
      return { ok: true, value };
    }
    case 'boolean': {
      if (typeof raw === 'boolean') return { ok: true, value: raw };
      if (raw === 'true' || raw === 'false') return { ok: true, value: raw === 'true' };
      return { ok: false };
    }
    case 'string': {
      if (typeof raw !== 'string' || raw.trim().length === 0) return { ok: false };
      return { ok: true, value: raw.trim() };
    }
    case 'number-list': {
      const list = Array.isArray(raw)
        ? raw
        : typeof raw === 'string'
          ? raw.split(',')
          : null;
      if (!list) return { ok: false };
      const numbers = list.map(Number).filter(Number.isFinite);
      if (numbers.length === 0) return { ok: false };
      return { ok: true, value: numbers };
    }
  }
}

export async function updateSetting(
  key: string,
  rawValue: unknown,
  actorId: string,
  ip: string | null,
): Promise<SettingWriteResult> {
  const descriptor = DESCRIPTOR_BY_KEY.get(key);
  if (!descriptor) return { ok: false, reason: 'UNKNOWN_KEY' };

  const coerced = coerce(descriptor.type, rawValue);
  if (!coerced.ok) {
    return { ok: false, reason: 'WRONG_TYPE', detail: `Expected ${descriptor.type}` };
  }

  const existing = await db.appSetting.findUnique({ where: { key }, select: { value: true } });
  const previous = existing
    ? existing.value
    : (bootstrapSettings() as Record<string, unknown>)[key];

  await db.appSetting.upsert({
    where: { key },
    create: {
      key,
      value: coerced.value as never,
      group: SETTING_GROUPS[key as keyof typeof SETTING_GROUPS] ?? descriptor.group,
      updatedBy: actorId,
    },
    update: { value: coerced.value as never, updatedBy: actorId },
  });

  // The next order must be priced with the new number, not up to a minute of
  // the old one (D-12).
  invalidateSettingsCache();

  await audit({
    actorId,
    action: 'settings.update',
    entityType: 'AppSetting',
    entityId: key,
    before: { value: previous },
    after: { value: coerced.value },
    ip,
  });

  return { ok: true };
}
