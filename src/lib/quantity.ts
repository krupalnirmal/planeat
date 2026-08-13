/**
 * B4 — portion quantity is computed HERE, in code, never by the AI.
 *
 *   serving_units  = adults + (children × 0.5)
 *   raw_grams      = 200 × serving_units
 *   quantity_grams = round UP to the nearest 250
 *   min 250 g, max 2000 g (above max → flag for admin review)
 *
 * Piece/bunch items (coriander, curry leaves, lemon):
 *   1 bunch per 4 serving units, minimum 1.
 *
 * Every constant is injectable so the admin panel can retune it at runtime
 * (R8). The defaults mirror the seeded app_settings values.
 */

export type WeighedUnit = 'G' | 'KG' | 'ML' | 'L';
export type CountedUnit = 'PIECE' | 'BUNCH' | 'PACK';
export type QuantityUnit = WeighedUnit | CountedUnit;

export interface Household {
  adults: number;
  children: number;
}

export interface QuantityConfig {
  servingGramsPerAdult: number;
  childServingMultiplier: number;
  roundingGrams: number;
  minGrams: number;
  maxGrams: number;
  servingUnitsPerBunch: number;
}

export const DEFAULT_QUANTITY_CONFIG: QuantityConfig = {
  servingGramsPerAdult: 200,
  childServingMultiplier: 0.5,
  roundingGrams: 250,
  minGrams: 250,
  maxGrams: 2000,
  servingUnitsPerBunch: 4,
};

export interface ComputedQuantity {
  /** Grams for weighed items, whole bunches/pieces for counted items. */
  quantity: number;
  unit: QuantityUnit;
  servingUnits: number;
  /** True when the raw requirement exceeded maxGrams and was capped. */
  exceedsMax: boolean;
  /** B4 — above max the plan goes to the admin review queue. */
  flagForAdminReview: boolean;
}

export function servingUnitsFor(
  household: Household,
  config: QuantityConfig = DEFAULT_QUANTITY_CONFIG,
): number {
  const adults = Math.max(0, Math.floor(household.adults));
  const children = Math.max(0, Math.floor(household.children));
  const units = adults + children * config.childServingMultiplier;
  // A household of nobody still eats: treat it as one adult.
  return units > 0 ? units : 1;
}

function roundUpTo(value: number, step: number): number {
  if (step <= 0) return value;
  return Math.ceil(value / step) * step;
}

function isCounted(unit: QuantityUnit): unit is CountedUnit {
  return unit === 'PIECE' || unit === 'BUNCH' || unit === 'PACK';
}

/**
 * The whole of B4 in one call.
 *
 *   4 adults           → 800 g raw  → 1000 g
 *   2 adults + 1 child → 500 g raw  →  500 g
 */
export function computeQuantity(
  household: Household,
  unitType: QuantityUnit,
  config: QuantityConfig = DEFAULT_QUANTITY_CONFIG,
): ComputedQuantity {
  const servingUnits = servingUnitsFor(household, config);

  if (isCounted(unitType)) {
    const count = Math.max(1, Math.ceil(servingUnits / config.servingUnitsPerBunch));
    return {
      quantity: count,
      unit: unitType,
      servingUnits,
      exceedsMax: false,
      flagForAdminReview: false,
    };
  }

  const rawGrams = config.servingGramsPerAdult * servingUnits;
  const rounded = roundUpTo(rawGrams, config.roundingGrams);
  const clamped = Math.min(Math.max(rounded, config.minGrams), config.maxGrams);
  const exceedsMax = rounded > config.maxGrams;

  return {
    quantity: clamped,
    unit: 'G',
    servingUnits,
    exceedsMax,
    flagForAdminReview: exceedsMax,
  };
}

/** "1000 g" → "1 kg" for display. Never used for arithmetic. */
export function formatQuantity(quantity: number, unit: QuantityUnit): string {
  if (unit === 'G' && quantity >= 1000 && quantity % 1000 === 0) {
    return `${quantity / 1000} kg`;
  }
  if (unit === 'G' && quantity >= 1000) {
    return `${(quantity / 1000).toFixed(2).replace(/\.?0+$/, '')} kg`;
  }
  const suffix: Record<QuantityUnit, string> = {
    G: 'g',
    KG: 'kg',
    ML: 'ml',
    L: 'l',
    PIECE: 'pc',
    BUNCH: 'bunch',
    PACK: 'pack',
  };
  return `${quantity} ${suffix[unit]}`;
}
