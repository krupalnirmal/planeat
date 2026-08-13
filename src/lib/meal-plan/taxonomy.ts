/**
 * The vocabulary the health profile is built from (M5).
 *
 * Deliberately import-free so the wizard (a client component) and the safety
 * layer (server-only) share exactly one definition. A second copy in the UI is
 * how a condition ends up selectable but never checked for red flags.
 *
 * Every code here is stored in the database. Renaming one is a migration, not
 * an edit — old profiles carry the old code.
 */

// ─────────────────────────────────────────────────────────────
// Medical conditions
// ─────────────────────────────────────────────────────────────

/**
 * M5 step 3 lists the everyday conditions. S3 additionally requires pregnancy,
 * breastfeeding, kidney disease, cancer treatment, type 1 diabetes, recent
 * surgery and eating-disorder indicators to be detectable — a red flag that
 * cannot be selected can never be raised, so they are part of the same list.
 */
export const MEDICAL_CONDITIONS = [
  'DIABETES_TYPE_2',
  'DIABETES_TYPE_1',
  'HYPERTENSION',
  'THYROID',
  'PCOS',
  'CHOLESTEROL',
  'ANAEMIA',
  'ACIDITY',
  'JOINT_PAIN',
  'KIDNEY_DISEASE',
  'PREGNANCY',
  'BREASTFEEDING',
  'CANCER_TREATMENT',
  'RECENT_SURGERY',
  'EATING_DISORDER',
  'NONE',
] as const;

export type MedicalCondition = (typeof MEDICAL_CONDITIONS)[number];

/**
 * S3 — any of these sets `flaggedForReview`.
 *
 * Kidney disease is on the list because potassium restriction is genuinely
 * dangerous to get wrong, and a great many vegetables are high in potassium.
 */
export const RED_FLAG_CONDITIONS: ReadonlySet<MedicalCondition> = new Set([
  'DIABETES_TYPE_1',
  'KIDNEY_DISEASE',
  'PREGNANCY',
  'BREASTFEEDING',
  'CANCER_TREATMENT',
  'RECENT_SURGERY',
  'EATING_DISORDER',
]);

/** Conditions whose selection is exclusive — "none" cannot sit with others. */
export const EXCLUSIVE_CONDITIONS: ReadonlySet<MedicalCondition> = new Set(['NONE']);

// ─────────────────────────────────────────────────────────────
// Allergens
// ─────────────────────────────────────────────────────────────

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

export const ALLERGEN_CODES = ALLERGENS.map((allergen) => allergen.code);

export function allergenByCode(code: string): AllergenDefinition | undefined {
  return ALLERGENS.find((allergen) => allergen.code === code);
}

// ─────────────────────────────────────────────────────────────
// Activity, diet and goals
// ─────────────────────────────────────────────────────────────

export const ACTIVITY_LEVELS = [
  'SEDENTARY',
  'LIGHT',
  'MODERATE',
  'ACTIVE',
  'VERY_ACTIVE',
] as const;
export type ActivityLevelCode = (typeof ACTIVITY_LEVELS)[number];

export const DIETARY_PREFERENCES = ['VEG', 'VEGAN', 'JAIN', 'EGGETARIAN'] as const;
export type DietaryPreferenceCode = (typeof DIETARY_PREFERENCES)[number];

export const HEALTH_GOALS = [
  'WEIGHT_LOSS',
  'WEIGHT_GAIN',
  'MAINTENANCE',
  'GENERAL_HEALTH',
  'MANAGE_CONDITION',
] as const;
export type HealthGoalCode = (typeof HEALTH_GOALS)[number];

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

// ─────────────────────────────────────────────────────────────
// Consent (S2, S6)
// ─────────────────────────────────────────────────────────────

/**
 * The disclaimer text the customer agreed to is versioned. If the wording ever
 * changes, existing consents remain attached to the version they actually
 * saw — which is the only thing that makes a consent record meaningful.
 */
export const CONSENT_VERSION = '2026-08-v1';
