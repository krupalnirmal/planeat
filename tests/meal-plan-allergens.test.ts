import { describe, expect, it } from 'vitest';
import {
  containsAllergen,
  findAllergensIn,
  isJainExcluded,
  isVeganExcluded,
} from '@/lib/meal-plan/allergens';

/**
 * S4 — the allergen hard block. Still exercised in production by
 * `src/lib/subscription/substitute.ts` (an out-of-stock item on an active
 * subscription is never substituted with something the customer is
 * allergic to) even though the AI meal-plan generator that originally used
 * this module was removed (session 2026-08-30).
 *
 * Split out of the old `meal-plan-safety.test.ts`, which also covered
 * `safety.ts` (health-profile red-flag routing / consent) — that module was
 * deleted along with the rest of the AI generation pipeline, so those tests
 * went with it.
 */

const PEANUT = {
  id: 'prd_peanut',
  nameEn: 'Fresh Groundnuts',
  nameMr: 'ओले शेंगदाणे',
  nameHi: 'ताज़ी मूंगफली',
  tags: ['protein', 'energy', 'allergen:peanut'],
  searchKeywords: 'fresh groundnuts ओले शेंगदाणे mungfali',
  aliases: ['shengdane', 'mungfali', 'शेंगदाणे'],
};

const SPINACH = {
  id: 'prd_spinach',
  nameEn: 'Spinach',
  nameMr: 'पालक',
  nameHi: 'पालक',
  tags: ['iron', 'leafy', 'anaemia'],
  searchKeywords: 'spinach palak पालक',
  aliases: ['palak'],
};

const PANEER = {
  id: 'prd_paneer',
  nameEn: 'Paneer',
  nameMr: 'पनीर',
  nameHi: 'पनीर',
  tags: ['dairy', 'protein', 'allergen:milk'],
  searchKeywords: 'paneer cottage cheese पनीर',
  aliases: ['paneer'],
};

const POTATO = {
  id: 'prd_potato',
  nameEn: 'Potato',
  nameMr: 'बटाटा',
  nameHi: 'आलू',
  tags: ['staple', 'starchy', 'root'],
  searchKeywords: 'potato batata आलू',
  aliases: ['batata', 'aloo'],
};

describe('S4 — allergen hard block', () => {
  it('catches a declared allergen by its structured tag', () => {
    expect(containsAllergen(PEANUT, ['PEANUT'])).toBe(true);
  });

  it('catches it by name when the tag is missing', () => {
    // The realistic failure: somebody adds a product and forgets the tag.
    const untagged = { ...PEANUT, tags: ['protein'] };
    expect(containsAllergen(untagged, ['PEANUT'])).toBe(true);
  });

  it('catches it from the Marathi name alone', () => {
    const marathiOnly = {
      ...PEANUT,
      nameEn: 'Unlabelled item',
      tags: [],
      searchKeywords: null,
      aliases: [],
    };
    expect(containsAllergen(marathiOnly, ['PEANUT'])).toBe(true);
  });

  it('catches it from an alias the product name does not contain', () => {
    const aliasOnly = {
      ...PEANUT,
      nameEn: 'Seasonal special',
      nameMr: 'हंगामी',
      nameHi: 'मौसमी',
      tags: [],
      searchKeywords: null,
      aliases: ['shengdane'],
    };
    expect(containsAllergen(aliasOnly, ['PEANUT'])).toBe(true);
  });

  it('resolves free text to the right allergen, with all its synonyms', () => {
    // Somebody types "peanuts"; the product is only called शेंगदाणे.
    const marathiOnly = { ...PEANUT, nameEn: 'x', tags: [], searchKeywords: null, aliases: [] };
    expect(containsAllergen(marathiOnly, ['peanuts'])).toBe(true);
    expect(containsAllergen(marathiOnly, ['मूंगफली'])).toBe(true);
  });

  it('fails CLOSED on free text it cannot resolve', () => {
    // "karela" is not a known allergen code. It must still be matched
    // literally — dropping a safe vegetable costs one boring day; serving an
    // allergen does not.
    const bitterGourd = {
      id: 'prd_karela',
      nameEn: 'Bitter Gourd',
      nameMr: 'कारले',
      nameHi: 'करेला',
      tags: [],
      searchKeywords: 'karela bitter gourd कारले',
      aliases: ['karela'],
    };
    expect(containsAllergen(bitterGourd, ['karela'])).toBe(true);
  });

  it('does not block an unrelated vegetable', () => {
    expect(containsAllergen(SPINACH, ['PEANUT'])).toBe(false);
    expect(containsAllergen(SPINACH, ['MILK', 'GLUTEN', 'SESAME'])).toBe(false);
  });

  it('does not block anything when nothing is declared', () => {
    expect(containsAllergen(PEANUT, [])).toBe(false);
  });

  it('ignores single-character free text rather than matching everything', () => {
    // A stray keystroke must not empty the catalogue.
    expect(containsAllergen(SPINACH, ['a'])).toBe(false);
  });

  it('reports which allergen matched, for the exclusion log', () => {
    const matches = findAllergensIn(PANEER, ['MILK']);
    expect(matches).toHaveLength(1);
    expect(matches[0].matched).toBe('MILK');
  });

  it('handles several declared allergies at once', () => {
    expect(containsAllergen(PEANUT, ['MILK', 'PEANUT'])).toBe(true);
  });
});

describe('dietary exclusions', () => {
  it('excludes root vegetables for a Jain diet', () => {
    expect(isJainExcluded(POTATO)).toBe(true);
    expect(isJainExcluded(SPINACH)).toBe(false);
  });

  it('excludes dairy for a vegan diet', () => {
    expect(isVeganExcluded(PANEER)).toBe(true);
    expect(isVeganExcluded(SPINACH)).toBe(false);
  });
});
