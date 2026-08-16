import { describe, expect, it } from 'vitest';
import en from '@/i18n/messages/en.json';
import hi from '@/i18n/messages/hi.json';
import mr from '@/i18n/messages/mr.json';

/**
 * R7 — no hard-coded user-facing strings, and Marathi must contain REAL
 * translations rather than placeholders. These tests fail the build if a
 * translator forgets a key or leaves English behind in the Marathi file.
 */

function flatten(value: unknown, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {};
  if (typeof value === 'string') {
    out[prefix] = value;
    return out;
  }
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      Object.assign(out, flatten(child, prefix ? `${prefix}.${key}` : key));
    }
  }
  return out;
}

const flatMr = flatten(mr);
const flatHi = flatten(hi);
const flatEn = flatten(en);

/**
 * Keys that are proper nouns or technical acronyms with no Marathi form —
 * "SKU" is written SKU on an Indian invoice, in a Marathi conversation, and in
 * this admin table. Translating it would make the column harder to read, not
 * easier. "Get Fresh" is the brand wordmark: the client's own marketing
 * renders it in Latin script inside Marathi and Hindi copy alike, the same
 * way "Swiggy" or "Zomato" never gets a Devanagari spelling — a brand name
 * is not a word that translates.
 *
 * This list stays short on purpose: it is the escape hatch from R7, and every
 * entry has to be a word that genuinely does not translate. `home.benefitsFreshTitle`
 * is "100%" — a numeral is the same numeral in every language.
 */
const SHARED_LATIN_KEYS = new Set([
  'language.en',
  'admin.catalogue.sku',
  'app.name',
  'home.benefitsFreshTitle',
]);

describe('message catalogues', () => {
  it('have identical key sets across mr, hi and en', () => {
    const mrKeys = Object.keys(flatMr).sort();
    expect(Object.keys(flatHi).sort()).toEqual(mrKeys);
    expect(Object.keys(flatEn).sort()).toEqual(mrKeys);
  });

  it('have no empty values', () => {
    for (const [locale, flat] of [
      ['mr', flatMr],
      ['hi', flatHi],
      ['en', flatEn],
    ] as const) {
      for (const [key, value] of Object.entries(flat)) {
        expect(value.trim(), `${locale}.${key} is empty`).not.toBe('');
      }
    }
  });

  it('contain real Devanagari in Marathi, not English placeholders', () => {
    const devanagari = /[ऀ-ॿ]/;
    for (const [key, value] of Object.entries(flatMr)) {
      if (SHARED_LATIN_KEYS.has(key)) continue;
      expect(devanagari.test(value), `mr.${key} has no Devanagari: "${value}"`).toBe(true);
    }
  });

  it('never say prescription, treatment, cure or medical advice as a claim (S1)', () => {
    const banned = /\b(prescription|prescribe[ds]?|treatment|cure[sd]?)\b/i;

    /**
     * S1 bans these words as CLAIMS ABOUT THE PLAN. Two narrow exemptions,
     * both describing something other than what the plan does:
     *
     * - `safety.*` — the disclaimer says what the plan is NOT ("is not medical
     *   advice, diagnosis, or treatment"). Removing the word there would
     *   weaken the very sentence that exists to protect the customer.
     * - `intake.condition*` — labels for the customer's OWN circumstances
     *   ("In cancer treatment"). S3 cannot flag a condition that cannot be
     *   selected, and rewording it to dodge a regex would make the wizard
     *   worse for no safety gain.
     *
     * Everything else — every rationale, note, button and heading — stays
     * covered.
     */
    const exempt = (key: string) =>
      key.startsWith('safety.') || key.startsWith('intake.condition');

    for (const [key, value] of Object.entries(flatEn)) {
      if (exempt(key)) continue;
      expect(banned.test(value), `en.${key} uses banned medical wording: "${value}"`).toBe(false);
    }
  });

  it('keep the S2 disclaimer intact in every locale', () => {
    expect(flatEn['safety.disclaimer']).toContain('not medical advice');
    expect(flatMr['safety.disclaimer']).toContain('वैद्यकीय सल्ला');
    expect(flatHi['safety.disclaimer']).toContain('चिकित्सा सलाह');
  });

  it('use the same ICU placeholders in every locale', () => {
    const placeholders = (s: string) => (s.match(/\{[a-zA-Z0-9_]+\}/g) ?? []).sort();
    for (const key of Object.keys(flatEn)) {
      expect(placeholders(flatMr[key]), `mr.${key} placeholders`).toEqual(
        placeholders(flatEn[key]),
      );
      expect(placeholders(flatHi[key]), `hi.${key} placeholders`).toEqual(
        placeholders(flatEn[key]),
      );
    }
  });
});
