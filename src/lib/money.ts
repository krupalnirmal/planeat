/**
 * R4 — money is ALWAYS integer paise held in a BigInt. Never a float, never a
 * Number for arithmetic. ₹1 = 100 paise.
 *
 * Every function here is pure and safe to use on the client, except that
 * BigInt does not survive JSON.stringify — serialise with `toPaiseString`
 * at the API boundary and parse back with `paise()`.
 */

export type Paise = bigint;

export function paise(value: bigint | number | string): Paise {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'string') return BigInt(value);
  if (!Number.isInteger(value)) {
    throw new TypeError(`Refusing to build paise from a non-integer: ${value}`);
  }
  return BigInt(value);
}

/** ₹12.50 → 1250n. Accepts rupees as a number or a decimal string. */
export function rupeesToPaise(rupees: number | string): Paise {
  const s = typeof rupees === 'number' ? rupees.toFixed(2) : rupees.trim();
  const negative = s.startsWith('-');
  const [whole, frac = ''] = (negative ? s.slice(1) : s).split('.');
  const paisePart = (frac + '00').slice(0, 2);
  const total = BigInt(whole || '0') * 100n + BigInt(paisePart);
  return negative ? -total : total;
}

/** 1250n → 12.5. Lossy by design — display only, never for arithmetic. */
export function paiseToRupees(value: Paise): number {
  return Number(value) / 100;
}

export function addPaise(...values: Paise[]): Paise {
  return values.reduce((sum, v) => sum + v, 0n);
}

export function subPaise(a: Paise, b: Paise): Paise {
  return a - b;
}

export function mulPaise(value: Paise, factor: number): Paise {
  // Scale by 1e6 so a fractional factor (e.g. 1.15) stays exact enough,
  // then round half-up back to whole paise.
  const scaled = BigInt(Math.round(factor * 1_000_000));
  const product = value * scaled;
  const rounded = (product + 500_000n) / 1_000_000n;
  return rounded;
}

/** Adds `percent`% on top. 1000n, 15 → 1150n. Used by B3's wallet buffer. */
export function addPercent(value: Paise, percent: number): Paise {
  return mulPaise(value, 1 + percent / 100);
}

export function maxPaise(a: Paise, b: Paise): Paise {
  return a > b ? a : b;
}

export function minPaise(a: Paise, b: Paise): Paise {
  return a < b ? a : b;
}

/** Safe transport across JSON. */
export function toPaiseString(value: Paise): string {
  return value.toString();
}

/** Indian grouping puts commas every TWO digits above the final group of three. */
const INR_PAIR_GROUPING = /\B(?=(\d{2})+(?!\d))/g;

/**
 * Formats paise for display using the Indian grouping system (₹1,23,456.00).
 * Locale only changes the digit shaping; the ₹ symbol is universal here.
 */
export function formatPaise(
  value: Paise,
  opts: { withSymbol?: boolean; hidePaise?: boolean } = {},
): string {
  const { withSymbol = true, hidePaise } = opts;
  const negative = value < 0n;
  const abs = negative ? -value : value;

  const whole = (abs / 100n).toString();
  const frac = (abs % 100n).toString().padStart(2, '0');

  // Indian grouping: last three digits, then pairs.
  const head = whole.length > 3 ? whole.slice(0, -3) : '';
  const tail = whole.length > 3 ? whole.slice(-3) : whole;
  const grouped = head ? `${head.replace(INR_PAIR_GROUPING, ',')},${tail}` : tail;

  const showPaise = hidePaise === undefined ? frac !== '00' : !hidePaise;
  const body = showPaise ? `${grouped}.${frac}` : grouped;

  return `${negative ? '-' : ''}${withSymbol ? '₹' : ''}${body}`;
}
