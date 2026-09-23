import type { UnitType } from '@/generated/prisma/enums';

/**
 * Unit words in Marathi, Hindi and English (M4).
 *
 * "एक जुडी कोथिंबीर" and "one bunch coriander" have to land on the same
 * `BUNCH`. Marathi also uses जुडी / गड्डी / पेंडी for the same thing depending
 * on which part of Maharashtra the customer is from, and all three are common
 * in Ahmednagar district.
 */

export interface UnitMatch {
  unit: UnitType;
  /** Multiplier onto the base unit — किलो is 1000 of G. */
  factor: number;
  word: string;
}

interface UnitDefinition {
  unit: UnitType;
  factor: number;
  words: readonly string[];
}

const UNITS: readonly UnitDefinition[] = [
  {
    unit: 'G',
    factor: 1000,
    words: ['किलो', 'किलोग्रॅम', 'किग्रा', 'कि', 'kilo', 'kilos', 'kg', 'kgs', 'kilogram'],
  },
  {
    unit: 'G',
    factor: 1,
    words: ['ग्रॅम', 'ग्राम', 'gram', 'grams', 'gm', 'gms', 'g'],
  },
  {
    unit: 'ML',
    factor: 1000,
    words: ['लिटर', 'लीटर', 'litre', 'litres', 'liter', 'l', 'ltr'],
  },
  {
    unit: 'ML',
    factor: 1,
    words: ['मिली', 'मिलीलिटर', 'ml'],
  },
  {
    unit: 'BUNCH',
    factor: 1,
    // Three regional words for the same thing, all current in Ahmednagar.
    words: ['जुडी', 'जुड्या', 'गड्डी', 'पेंडी', 'gaddi', 'judi', 'bunch', 'bunches'],
  },
  {
    unit: 'PIECE',
    factor: 1,
    words: ['नग', 'नंग', 'piece', 'pieces', 'pc', 'pcs', 'no', 'nos'],
  },
  {
    unit: 'PIECE',
    factor: 12,
    words: ['डझन', 'दर्जन', 'dozen'],
  },
  {
    unit: 'PACK',
    factor: 1,
    words: ['पॅकेट', 'पाकीट', 'पॅक', 'packet', 'pack', 'packets'],
  },
];

const BY_WORD = new Map<string, UnitMatch>();
for (const definition of UNITS) {
  for (const word of definition.words) {
    BY_WORD.set(word.toLowerCase(), {
      unit: definition.unit,
      factor: definition.factor,
      word,
    });
  }
}

export function lookupUnit(word: string): UnitMatch | null {
  return BY_WORD.get(word.trim().toLowerCase()) ?? null;
}

export function isUnitWord(word: string): boolean {
  return BY_WORD.has(word.trim().toLowerCase());
}

export interface ParsedUnit {
  match: UnitMatch | null;
  consumed: string[];
}

export function parseUnitWords(text: string): ParsedUnit {
  const words = text.toLowerCase().split(/\s+/).filter(Boolean);

  for (const word of words) {
    const match = lookupUnit(word);
    if (match) return { match, consumed: [word] };
  }

  return { match: null, consumed: [] };
}

/**
 * The quantity in the product's own unit.
 *
 * "दीड किलो" → 1500 G. "दोन जुड्या" → 2 BUNCH. When no unit was spoken, a
 * weighed product defaults to kilograms — asking for "दोन कांदे" almost always
 * means two kilos in a vegetable market, not two onions.
 */
export function toProductQuantity(
  value: number | null,
  unitMatch: UnitMatch | null,
  productUnitType: UnitType,
): { quantity: number; unit: UnitType } {
  const amount = value ?? 1;

  if (unitMatch) {
    const scaled = amount * unitMatch.factor;
    return {
      quantity: Math.max(1, Math.round(scaled)),
      unit: unitMatch.unit,
    };
  }

  // No unit spoken. Counted products take the number as a count; weighed ones
  // take it as kilograms.
  if (productUnitType === 'PIECE' || productUnitType === 'BUNCH' || productUnitType === 'PACK') {
    return { quantity: Math.max(1, Math.round(amount)), unit: productUnitType };
  }

  if (productUnitType === 'ML' || productUnitType === 'L') {
    return { quantity: Math.max(1, Math.round(amount * 1000)), unit: 'ML' };
  }

  return { quantity: Math.max(1, Math.round(amount * 1000)), unit: 'G' };
}

/**
 * Review-screen pricing (session 2026-09-23, client reference screenshot)
 * — everything here is derived straight from the matched `ProductVariant`'s
 * own real `pricePaise`/`quantity`/`unit`, never invented. Two different
 * numbers share the same underlying data on purpose: `unitRate` is the
 * normalised "per kg / per litre / per bunch" figure a customer uses to
 * compare pack sizes (real e-commerce convention); `packCount` × the
 * variant's own flat price is the actual line total for however many packs
 * the requested quantity works out to.
 */

const BASE_FACTOR: Record<UnitType, number> = {
  G: 1,
  KG: 1000,
  ML: 1,
  L: 1000,
  PIECE: 1,
  BUNCH: 1,
  PACK: 1,
};

const UNIT_FAMILY: Record<UnitType, 'weight' | 'volume' | 'count'> = {
  G: 'weight',
  KG: 'weight',
  ML: 'volume',
  L: 'volume',
  PIECE: 'count',
  BUNCH: 'count',
  PACK: 'count',
};

/** Converts to the smallest base scale within a unit's own family — grams,
    millilitres, or a raw count. `toProductQuantity` above only ever
    persists `SmartListItem.unit` already in one of these base forms
    (G/ML/PIECE/BUNCH/PACK, never KG/L), so this is the one place KG/L
    conversion needs to happen at all. */
export function toBaseQuantity(quantity: number, unit: UnitType): number {
  return quantity * BASE_FACTOR[unit];
}

/** How many packs of the matched variant the requested quantity works out
    to. 1 whenever the two aren't in the same family (e.g. a BUNCH request
    somehow matched a PIECE-priced variant) — scaling across unrelated
    units would produce a number that looks precise but isn't real. */
export function packCountFor(
  requestedQuantity: number,
  requestedUnit: UnitType,
  variantQuantity: number,
  variantUnit: UnitType,
): number {
  if (UNIT_FAMILY[requestedUnit] !== UNIT_FAMILY[variantUnit] || variantQuantity <= 0) return 1;
  const requestedBase = toBaseQuantity(requestedQuantity, requestedUnit);
  const variantBase = toBaseQuantity(variantQuantity, variantUnit);
  return Math.max(1, Math.round(requestedBase / variantBase));
}

/** The variant's own price, normalised to a per-kg/per-litre/per-count
    rate, plus the unit word to label it with ("kg", "l", "bunch", …). Weight
    and volume always normalise to the kg/l scale (standard grocery unit
    pricing); counted units show the rate per however many the pack itself
    holds (a "6-piece" pack shows price ÷ 6, not price ÷ 1). */
export function unitRate(
  variantQuantity: number,
  variantUnit: UnitType,
  pricePaise: bigint,
): { ratePaise: bigint; suffix: string } | null {
  if (variantQuantity <= 0) return null;

  const family = UNIT_FAMILY[variantUnit];
  if (family === 'weight') {
    const grams = variantQuantity * BASE_FACTOR[variantUnit];
    return { ratePaise: (pricePaise * 1000n) / BigInt(grams), suffix: 'kg' };
  }
  if (family === 'volume') {
    const ml = variantQuantity * BASE_FACTOR[variantUnit];
    return { ratePaise: (pricePaise * 1000n) / BigInt(ml), suffix: 'l' };
  }
  const countSuffixes: Partial<Record<UnitType, string>> = { PIECE: 'pc', BUNCH: 'bunch', PACK: 'pack' };
  const suffix = countSuffixes[variantUnit] ?? 'unit';
  return { ratePaise: pricePaise / BigInt(variantQuantity), suffix };
}
