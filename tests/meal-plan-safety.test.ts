import { describe, expect, it } from 'vitest';
import {
  containsAllergen,
  findAllergensIn,
  isJainExcluded,
  isVeganExcluded,
} from '@/lib/meal-plan/allergens';
import { assessSafety, detectRedFlags, hasValidConsent } from '@/lib/meal-plan/safety';

/**
 * PART 6.4 — the medical safety layer. This is the file to read first if you
 * are changing anything in `src/lib/meal-plan/`.
 *
 * PART 12 acceptance criteria covered here:
 *   - "A peanut-allergy profile never produces a plan containing peanuts"
 *     (the filtering half; the 20-generation half is in meal-plan-pipeline)
 *   - "A pregnancy flag sets flaggedForReview"
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

describe('S3 — red-flag routing', () => {
  const base = {
    age: 35,
    medicalConditions: [] as string[],
    medications: null,
    notes: null,
    goal: 'GENERAL_HEALTH',
  };

  it('does not flag an ordinary profile', () => {
    expect(assessSafety(base).flaggedForReview).toBe(false);
  });

  it('flags a pregnancy condition', () => {
    // PART 12 — "A pregnancy flag sets flaggedForReview."
    const result = assessSafety({ ...base, medicalConditions: ['PREGNANCY'] });
    expect(result.flaggedForReview).toBe(true);
    expect(result.flags.map((flag) => flag.code)).toContain('PREGNANCY');
  });

  it('flags pregnancy mentioned only in free text, in Marathi', () => {
    const result = assessSafety({ ...base, notes: 'मी गर्भवती आहे' });
    expect(result.flags.map((flag) => flag.code)).toContain('PREGNANCY');
  });

  it('flags both ends of the age range', () => {
    expect(detectRedFlags({ ...base, age: 17 })[0]?.code).toBe('AGE_UNDER_18');
    expect(detectRedFlags({ ...base, age: 76 })[0]?.code).toBe('AGE_OVER_75');
  });

  it('does not flag the boundary ages themselves', () => {
    expect(assessSafety({ ...base, age: 18 }).flaggedForReview).toBe(false);
    expect(assessSafety({ ...base, age: 75 }).flaggedForReview).toBe(false);
  });

  it('flags kidney disease — potassium restriction is dangerous to get wrong', () => {
    expect(
      assessSafety({ ...base, medicalConditions: ['KIDNEY_DISEASE'] }).flaggedForReview,
    ).toBe(true);
  });

  it('flags dialysis mentioned in notes without the condition ticked', () => {
    const result = assessSafety({ ...base, notes: 'on dialysis twice a week' });
    expect(result.flags.map((flag) => flag.code)).toContain('KIDNEY_DISEASE');
  });

  it('flags insulin found in the medications field', () => {
    const result = assessSafety({ ...base, medications: 'Insulin 10 units at night' });
    expect(result.flags.map((flag) => flag.code)).toContain('INSULIN_USE');
  });

  it('flags type 1 diabetes but not type 2', () => {
    expect(
      assessSafety({ ...base, medicalConditions: ['DIABETES_TYPE_1'] }).flaggedForReview,
    ).toBe(true);
    expect(
      assessSafety({ ...base, medicalConditions: ['DIABETES_TYPE_2'] }).flaggedForReview,
    ).toBe(false);
  });

  it('flags a stated goal of rapid weight loss', () => {
    const result = assessSafety({ ...base, notes: 'want to lose weight fast before the wedding' });
    expect(result.flags.map((flag) => flag.code)).toContain('RAPID_WEIGHT_LOSS');
  });

  it('flags recent surgery from Marathi free text', () => {
    const result = assessSafety({ ...base, notes: 'नुकतीच ऑपरेशन झाले आहे' });
    expect(result.flags.map((flag) => flag.code)).toContain('RECENT_SURGERY');
  });

  it('records every distinct flag without duplicating one', () => {
    const result = assessSafety({
      ...base,
      age: 80,
      medicalConditions: ['PREGNANCY', 'KIDNEY_DISEASE'],
      notes: 'pregnant and on dialysis',
    });
    const codes = result.flags.map((flag) => flag.code);
    expect(new Set(codes).size).toBe(codes.length);
    expect(codes).toContain('AGE_OVER_75');
    expect(codes).toContain('PREGNANCY');
    expect(codes).toContain('KIDNEY_DISEASE');
  });

  it('produces a reason string for the admin queue', () => {
    const result = assessSafety({ ...base, medicalConditions: ['PREGNANCY'] });
    expect(result.flagReason).toContain('PREGNANCY');
  });
});

describe('S2 — consent', () => {
  it('requires both a timestamp and a version', () => {
    expect(hasValidConsent({ consentGivenAt: new Date(), consentVersion: '2026-08-v1' })).toBe(true);
    expect(hasValidConsent({ consentGivenAt: null, consentVersion: '2026-08-v1' })).toBe(false);
    expect(hasValidConsent({ consentGivenAt: new Date(), consentVersion: null })).toBe(false);
  });
});
