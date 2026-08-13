import type { Locale } from '@/generated/prisma/enums';

/**
 * Catalogue text handling (M2).
 *
 * TiDB Starter has no native full-text search (PART 4.3), so matching is done
 * with `LIKE` over a denormalised `search_keywords` column plus the
 * `product_aliases` table. The alias table does more work here than any
 * clever algorithm would: `kanda` → कांदा → Onion is a dictionary fact, not
 * something to infer at query time.
 */

export interface LocalisedNames {
  nameEn: string;
  nameMr: string;
  nameHi: string;
}

export function pickName(names: LocalisedNames, locale: Locale | string): string {
  switch (locale) {
    case 'mr':
      return names.nameMr || names.nameEn;
    case 'hi':
      return names.nameHi || names.nameEn;
    default:
      return names.nameEn;
  }
}

/**
 * Lowercases, strips Latin diacritics and collapses whitespace.
 *
 * Devanagari must survive intact. Two traps here, both of which silently
 * destroy Marathi text: NFKD decomposes कांदा into a base letter plus vowel
 * signs, and `\p{L}` does not match those signs — they are marks (`\p{M}`).
 * Without recomposing and allowing marks through, कांदा normalises to "क द"
 * and matches nothing.
 */
export function normaliseSearchText(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // Latin combining diacritics only
    .normalize('NFC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Splits a query into useful terms. Single characters are dropped: a stray "a"
 * would match most of the catalogue and rank it as noise.
 */
export function searchTerms(query: string, max = 4): string[] {
  return normaliseSearchText(query)
    .split(' ')
    .filter((term) => term.length > 1)
    .slice(0, max);
}

export function hasDevanagari(input: string): boolean {
  return /[ऀ-ॿ]/.test(input);
}

/**
 * Common Latin spellings of Marathi/Hindi sounds, so `kanda`, `kaanda` and
 * `khanda` collapse to the same key. This catches the typing variation the
 * alias table cannot enumerate — a phone keyboard produces a different
 * transliteration nearly every time.
 */
const ROMAN_FOLDINGS: Array<[RegExp, string]> = [
  [/aa+/g, 'a'],
  [/ee+/g, 'i'],
  [/ii+/g, 'i'],
  [/oo+/g, 'u'],
  [/uu+/g, 'u'],
  // e/i and o/u are the two vowel pairs Indian transliteration genuinely
  // swaps: bhendi/bhindi, kothimbir/kuthimbir. Folding them is what makes a
  // phone keyboard's guess match the alias table.
  [/e/g, 'i'],
  [/o/g, 'u'],
  [/kh/g, 'k'],
  [/gh/g, 'g'],
  [/ch/g, 'c'],
  [/jh/g, 'j'],
  [/th/g, 't'],
  [/dh/g, 'd'],
  [/ph/g, 'f'],
  [/bh/g, 'b'],
  [/sh/g, 's'],
  [/v/g, 'w'],
  [/z/g, 'j'],
  [/y$/g, 'i'],
  [/(.)\1+/g, '$1'], // any remaining doubled letter
];

/** A fuzzy key for Latin-script terms. Devanagari passes through unchanged. */
export function transliterationKey(term: string): string {
  const normalised = normaliseSearchText(term);
  if (hasDevanagari(normalised)) return normalised;

  return ROMAN_FOLDINGS.reduce(
    (value, [pattern, replacement]) => value.replace(pattern, replacement),
    normalised,
  );
}

/**
 * Ranks a matched product against the query. Higher is better.
 *
 * An exact name match must outrank a substring buried in a keyword blob,
 * otherwise searching "onion" surfaces "onion seeds" above onions.
 */
export function scoreMatch(
  query: string,
  candidate: { names: string[]; aliases: string[]; keywords: string },
): number {
  const q = normaliseSearchText(query);
  const qKey = transliterationKey(q);
  if (!q) return 0;

  let score = 0;

  for (const name of candidate.names) {
    const n = normaliseSearchText(name);
    if (n === q) score = Math.max(score, 100);
    else if (n.startsWith(q)) score = Math.max(score, 80);
    else if (n.includes(q)) score = Math.max(score, 60);
  }

  for (const alias of candidate.aliases) {
    const a = normaliseSearchText(alias);
    if (a === q) score = Math.max(score, 95);
    else if (transliterationKey(a) === qKey) score = Math.max(score, 85);
    else if (a.startsWith(q)) score = Math.max(score, 70);
    else if (a.includes(q)) score = Math.max(score, 50);
  }

  if (score === 0 && normaliseSearchText(candidate.keywords).includes(q)) {
    score = 30;
  }

  return score;
}
