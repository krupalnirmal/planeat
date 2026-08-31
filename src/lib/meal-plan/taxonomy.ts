/**
 * The allergen/dietary-exclusion vocabulary `allergens.ts` matches against.
 *
 * Trimmed (session 2026-08-30) to just what's still used: the health-profile
 * intake wizard that used to read the rest of this file (medical conditions,
 * activity levels, consent versioning) was removed along with the AI meal
 * plan generator. `allergens.ts` itself survives — it backs
 * `src/lib/subscription/substitute.ts`'s out-of-stock substitution on active
 * subscriptions, which must never substitute in something the customer is
 * allergic to.
 */

/**
 * S4 — a declared allergen is a HARD constraint, enforced in code.
 *
 * `terms` are matched against product names, aliases and keywords in all three
 * languages; `tags` are matched against the structured `products.tags` array.
 * Both layers exist because neither alone is reliable: tags depend on the
 * catalogue being tagged correctly, and names depend on spelling.
 */
export interface AllergenDefinition {
  code: string;
  /** Structured tags a product may carry, e.g. `allergen:peanut`. */
  tags: readonly string[];
  /** Lowercase substrings matched against names, aliases and keywords. */
  terms: readonly string[];
}

export const ALLERGENS: readonly AllergenDefinition[] = [
  {
    code: 'PEANUT',
    tags: ['allergen:peanut'],
    // The Latin spellings are enumerated rather than inferred. A phone keyboard
    // produces a different transliteration of शेंगदाणे nearly every time, and
    // for an allergen a missed spelling is not a search-quality problem.
    terms: [
      'peanut',
      'groundnut',
      'शेंगदाणे',
      'शेंगदाणा',
      'भुईमूग',
      'मूंगफली',
      'shengdane',
      'shengdana',
      'shendane',
      'singdana',
      'singdane',
      'mungfali',
      'moongfali',
    ],
  },
  {
    code: 'TREE_NUT',
    tags: ['allergen:tree_nut'],
    terms: ['cashew', 'almond', 'walnut', 'pistachio', 'काजू', 'बदाम', 'अक्रोड', 'पिस्ता'],
  },
  {
    code: 'MILK',
    tags: ['allergen:milk', 'dairy'],
    terms: ['milk', 'curd', 'paneer', 'ghee', 'butter', 'cheese', 'दूध', 'दही', 'पनीर', 'तूप', 'लोणी'],
  },
  {
    code: 'GLUTEN',
    tags: ['allergen:gluten'],
    terms: ['wheat', 'atta', 'bread', 'maida', 'suji', 'गहू', 'गव्हाचे', 'ब्रेड', 'आटा', 'मैदा', 'रवा'],
  },
  {
    code: 'SOY',
    tags: ['allergen:soy'],
    terms: ['soy', 'soya', 'tofu', 'सोया', 'सोयाबीन'],
  },
  {
    code: 'SESAME',
    tags: ['allergen:sesame'],
    terms: ['sesame', 'til', 'तीळ', 'तिळ'],
  },
  {
    code: 'MUSTARD',
    tags: ['allergen:mustard'],
    terms: ['mustard', 'मोहरी', 'सरसों', 'राई'],
  },
  {
    code: 'EGG',
    tags: ['allergen:egg'],
    terms: ['egg', 'अंडे', 'अंडी', 'अंडा'],
  },
  {
    code: 'FISH',
    tags: ['allergen:fish'],
    terms: ['fish', 'मासे', 'मच्छी'],
  },
  {
    code: 'SHELLFISH',
    tags: ['allergen:shellfish'],
    terms: ['prawn', 'shrimp', 'crab', 'कोळंबी', 'खेकडा'],
  },
  {
    code: 'BRINJAL',
    tags: ['allergen:brinjal'],
    terms: ['brinjal', 'eggplant', 'aubergine', 'वांगी', 'वांगे', 'बैंगन'],
  },
] as const;

export function allergenByCode(code: string): AllergenDefinition | undefined {
  return ALLERGENS.find((allergen) => allergen.code === code);
}

/**
 * Jain cooking excludes root vegetables. This is a dietary constraint, not an
 * allergy, but it is just as absolute to the person who holds it — so it is
 * filtered in code alongside the allergens rather than left to the prompt.
 */
export const JAIN_EXCLUDED_TAGS = ['root', 'allium', 'underground'] as const;

export const JAIN_EXCLUDED_TERMS = [
  'onion',
  'garlic',
  'potato',
  'carrot',
  'beetroot',
  'radish',
  'ginger',
  'कांदा',
  'लसूण',
  'बटाटा',
  'गाजर',
  'बीट',
  'मुळा',
  'आले',
] as const;
