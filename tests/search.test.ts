import { describe, expect, it } from 'vitest';
import {
  hasDevanagari,
  normaliseSearchText,
  pickName,
  scoreMatch,
  searchTerms,
  transliterationKey,
} from '@/lib/catalog/text';

/**
 * PART 12 — "Search finds कांदा, `kanda` and `onion` as the same product."
 *
 * The database join is what actually returns the row; these tests pin the
 * normalisation and ranking that decide whether the right row comes first.
 */

const ONION = {
  names: ['Onion', 'कांदा', 'प्याज'],
  aliases: ['kanda', 'onion', 'pyaj', 'प्याज', 'कांदे'],
  keywords: 'onion कांदा प्याज kanda pyaj staple allium',
};

const ONION_SEEDS = {
  names: ['Onion Seeds', 'कांदा बी', 'प्याज बीज'],
  aliases: ['kanda bi', 'onion seeds'],
  keywords: 'onion seeds कांदा बी',
};

describe('normalisation', () => {
  it('lowercases and collapses whitespace', () => {
    expect(normaliseSearchText('  Onion   Seeds ')).toBe('onion seeds');
  });

  it('strips punctuation but keeps letters and digits', () => {
    expect(normaliseSearchText('Toor-Dal, 1kg!')).toBe('toor dal 1kg');
  });

  it('leaves Devanagari intact', () => {
    expect(normaliseSearchText('कांदा')).toBe('कांदा');
    expect(hasDevanagari(normaliseSearchText('कांदा'))).toBe(true);
  });

  it('drops single characters from the term list', () => {
    expect(searchTerms('a kanda b')).toEqual(['kanda']);
  });

  it('caps the number of terms so one query cannot fan out', () => {
    expect(searchTerms('one two three four five six').length).toBe(4);
  });
});

describe('transliteration folding', () => {
  it('collapses common romanisations of the same word', () => {
    const key = transliterationKey('kanda');
    expect(transliterationKey('kaanda')).toBe(key);
    expect(transliterationKey('khanda')).toBe(key);
    expect(transliterationKey('KANDA')).toBe(key);
  });

  it('folds bhendi, bhindi and bendi together', () => {
    const key = transliterationKey('bhendi');
    expect(transliterationKey('bhindi')).toBe(key);
    expect(transliterationKey('bendi')).toBe(key);
  });

  it('leaves Devanagari untouched', () => {
    expect(transliterationKey('कांदा')).toBe('कांदा');
  });

  it('does not collapse genuinely different vegetables', () => {
    expect(transliterationKey('kanda')).not.toBe(transliterationKey('gajar'));
    expect(transliterationKey('methi')).not.toBe(transliterationKey('palak'));
  });
});

describe('match scoring', () => {
  it('finds the same product from Marathi, transliteration and English', () => {
    expect(scoreMatch('कांदा', ONION)).toBeGreaterThan(0);
    expect(scoreMatch('kanda', ONION)).toBeGreaterThan(0);
    expect(scoreMatch('onion', ONION)).toBeGreaterThan(0);
  });

  it('ranks an exact name above a partial one', () => {
    expect(scoreMatch('onion', ONION)).toBeGreaterThan(scoreMatch('onion', ONION_SEEDS));
  });

  it('ranks a transliteration variant highly via the alias table', () => {
    expect(scoreMatch('kaanda', ONION)).toBeGreaterThanOrEqual(80);
  });

  it('scores zero for an unrelated query', () => {
    expect(scoreMatch('icecream', ONION)).toBe(0);
  });

  it('scores zero for an empty query rather than matching everything', () => {
    expect(scoreMatch('', ONION)).toBe(0);
    expect(scoreMatch('   ', ONION)).toBe(0);
  });

  it('falls back to the keyword blob when nothing else matches', () => {
    expect(scoreMatch('allium', ONION)).toBe(30);
  });
});

describe('localised names', () => {
  const names = { nameEn: 'Onion', nameMr: 'कांदा', nameHi: 'प्याज' };

  it('picks the name for the active locale', () => {
    expect(pickName(names, 'mr')).toBe('कांदा');
    expect(pickName(names, 'hi')).toBe('प्याज');
    expect(pickName(names, 'en')).toBe('Onion');
  });

  it('falls back to English when a translation is missing', () => {
    expect(pickName({ nameEn: 'Onion', nameMr: '', nameHi: '' }, 'mr')).toBe('Onion');
  });
});
