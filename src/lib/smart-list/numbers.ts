/**
 * Quantity words in Marathi, Hindi and English (M4).
 *
 * A customer speaking their list says "दीड किलो कांदा", not "1.5 kg onion".
 * Marathi has dedicated single words for the fractions people actually use in
 * a vegetable market — पाव, अर्धा, पाऊण, सव्वा, दीड, अडीच, साडेतीन — and none
 * of them are digits. A parser that only reads digits gets the item right and
 * the amount wrong, which is worse than not parsing at all: the customer sees
 * a plausible number and does not check it.
 *
 * Pure and import-free, so it is exercised by tests without a model or a
 * database.
 */

/** Devanagari digits ० १ २ ३ ४ ५ ६ ७ ८ ९ → ASCII. */
export function normaliseDigits(input: string): string {
  return input.replace(/[०-९]/g, (digit) => String(digit.charCodeAt(0) - 0x0966));
}

/** Whole numbers, as spoken. */
const WHOLE_WORDS: Record<string, number> = {
  // Marathi
  एक: 1,
  दोन: 2,
  तीन: 3,
  चार: 4,
  पाच: 5,
  सहा: 6,
  सात: 7,
  आठ: 8,
  नऊ: 9,
  दहा: 10,
  अकरा: 11,
  बारा: 12,
  पंधरा: 15,
  वीस: 20,
  पंचवीस: 25,
  तीस: 30,
  // Hindi where it differs
  दो: 2,
  पाँच: 5,
  पांच: 5,
  छह: 6,
  छः: 6,
  नौ: 9,
  दस: 10,
  ग्यारह: 11,
  बारह: 12,
  पंद्रह: 15,
  बीस: 20,
  // English
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  dozen: 12,
  // Common Latin transliterations
  ek: 1,
  don: 2,
  do: 2,
  teen: 3,
  tin: 3,
  chaar: 4,
  char: 4,
  paach: 5,
  panch: 5,
};

/**
 * Fraction words. These are the ones that matter — a shopkeeper hears
 * "पाव किलो" many times a day and "0.25 kilograms" never.
 */
const FRACTION_WORDS: Record<string, number> = {
  पाव: 0.25,
  अर्धा: 0.5,
  अर्धं: 0.5,
  अर्धे: 0.5,
  अर्धी: 0.5,
  आधा: 0.5,
  पाऊण: 0.75,
  पौना: 0.75,
  सव्वा: 1.25,
  सवा: 1.25,
  दीड: 1.5,
  डेढ: 1.5,
  'डेढ़': 1.5,
  अडीच: 2.5,
  ढाई: 2.5,
  half: 0.5,
  quarter: 0.25,
  pav: 0.25,
  adha: 0.5,
  ardha: 0.5,
  savva: 1.25,
  deed: 1.5,
  didh: 1.5,
  adich: 2.5,
};

/**
 * साडे- prefixes a whole number to add a half: साडेतीन = 3.5.
 *
 * Written both as one word and as two, so both are handled. साडेदोन is not
 * used — that is अडीच — which is exactly the kind of thing a general-purpose
 * model gets wrong and a lookup table does not.
 */
const SADE_PREFIXES = ['साडे', 'सादे', 'sade'];

export interface ParsedQuantity {
  /** The number found, or null when the text carried none. */
  value: number | null;
  /** The words consumed, so the caller can strip them from the item name. */
  consumed: string[];
}

function lookupWord(word: string): number | null {
  if (word in FRACTION_WORDS) return FRACTION_WORDS[word];
  if (word in WHOLE_WORDS) return WHOLE_WORDS[word];

  // साडेतीन written as one word.
  for (const prefix of SADE_PREFIXES) {
    if (word.startsWith(prefix) && word.length > prefix.length) {
      const rest = word.slice(prefix.length);
      const base = WHOLE_WORDS[rest];
      if (base !== undefined) return base + 0.5;
    }
  }

  const numeric = Number(normaliseDigits(word));
  if (Number.isFinite(numeric) && numeric > 0) return numeric;

  return null;
}

/**
 * Finds the quantity in a phrase and reports which words it used.
 *
 * Scans left to right and takes the FIRST number: "दोन किलो कांदा आणि एक
 * टोमॅटो" has already been split into lines by the caller, so a second number
 * inside one line is part of the item name, not a second quantity.
 */
export function parseQuantityWords(text: string): ParsedQuantity {
  const words = normaliseDigits(text)
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word.length > 0);

  for (let index = 0; index < words.length; index++) {
    const word = words[index];

    // "साडे तीन" written as two words.
    if (SADE_PREFIXES.includes(word) && index + 1 < words.length) {
      const base = WHOLE_WORDS[words[index + 1]];
      if (base !== undefined) {
        return { value: base + 0.5, consumed: [word, words[index + 1]] };
      }
    }

    const value = lookupWord(word);
    if (value !== null) return { value, consumed: [word] };
  }

  return { value: null, consumed: [] };
}

/** Every quantity word, for the item-name stripper. */
export function isQuantityWord(word: string): boolean {
  const lower = normaliseDigits(word).toLowerCase();
  if (lower in FRACTION_WORDS || lower in WHOLE_WORDS) return true;
  if (SADE_PREFIXES.some((prefix) => lower.startsWith(prefix))) return true;
  return /^\d+(\.\d+)?$/.test(lower);
}
