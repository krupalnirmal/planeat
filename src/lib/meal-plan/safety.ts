import { normaliseSearchText } from '@/lib/catalog/text';
import { RED_FLAG_CONDITIONS, type MedicalCondition } from './taxonomy';

/**
 * S3 — red-flag routing.
 *
 *   "Any of these sets `flaggedForReview = true`, shows a doctor-consultation
 *    banner, and enters the admin review queue."
 *
 * B8 — a flagged plan still generates and displays. The customer may proceed;
 * the banner and the disclaimer are the safeguard, and the admin review is a
 * second layer. Blocking would push someone back to the WhatsApp-and-paper
 * process this app replaced, where nobody was checking anything at all.
 *
 * Every check is deterministic and runs BEFORE the AI call, so the flag does
 * not depend on a model noticing anything.
 */

export interface SafetyProfileInput {
  age: number | null;
  medicalConditions: readonly string[];
  medications: string | null;
  notes: string | null;
  goal: string;
}

export type RedFlagCode =
  | 'AGE_UNDER_18'
  | 'AGE_OVER_75'
  | 'PREGNANCY'
  | 'BREASTFEEDING'
  | 'KIDNEY_DISEASE'
  | 'CANCER_TREATMENT'
  | 'DIABETES_TYPE_1'
  | 'INSULIN_USE'
  | 'EATING_DISORDER'
  | 'RAPID_WEIGHT_LOSS'
  | 'RECENT_SURGERY'
  | 'FREE_TEXT_KEYWORD';

export interface RedFlag {
  code: RedFlagCode;
  /** What triggered it, for the admin queue. Never shown to the customer. */
  detail: string;
}

/**
 * Free-text triggers, in all three languages.
 *
 * This list is deliberately broad. A false positive costs one banner and one
 * entry in a review queue the owner reads anyway; a false negative means a
 * dialysis patient gets a potassium-heavy plan with no warning at all.
 */
const KEYWORD_FLAGS: ReadonlyArray<{ code: RedFlagCode; terms: readonly string[] }> = [
  {
    code: 'PREGNANCY',
    terms: ['pregnan', 'expecting', 'गर्भवती', 'गरोदर', 'प्रेग्नंट', 'गर्भावस्था'],
  },
  {
    code: 'BREASTFEEDING',
    terms: ['breastfeed', 'lactating', 'nursing', 'स्तनपान', 'दूध पाजते', 'बाळाला दूध'],
  },
  {
    code: 'KIDNEY_DISEASE',
    terms: ['dialysis', 'kidney', 'renal', 'nephro', 'creatinine', 'डायलिसिस', 'किडनी', 'मूत्रपिंड'],
  },
  {
    code: 'CANCER_TREATMENT',
    terms: ['cancer', 'chemo', 'radiation', 'oncolog', 'tumour', 'tumor', 'कॅन्सर', 'कर्करोग', 'केमो'],
  },
  {
    code: 'INSULIN_USE',
    terms: ['insulin', 'इन्सुलिन', 'इंसुलिन'],
  },
  {
    code: 'RECENT_SURGERY',
    terms: [
      'surgery',
      'operation',
      'post op',
      'postop',
      'stitches',
      'शस्त्रक्रिया',
      'ऑपरेशन',
      'टाके',
    ],
  },
  {
    code: 'EATING_DISORDER',
    terms: [
      'anorexi',
      'bulimi',
      'eating disorder',
      'binge',
      'starv',
      'not eating',
      'उपाशी',
      'खाणे बंद',
    ],
  },
  {
    code: 'RAPID_WEIGHT_LOSS',
    terms: [
      'crash diet',
      'rapid weight',
      'lose weight fast',
      'quickly lose',
      '10 kg in',
      'झपाट्याने वजन',
      'लवकर वजन कमी',
      'तेजी से वजन',
    ],
  },
];

const CONDITION_TO_FLAG: Partial<Record<MedicalCondition, RedFlagCode>> = {
  DIABETES_TYPE_1: 'DIABETES_TYPE_1',
  KIDNEY_DISEASE: 'KIDNEY_DISEASE',
  PREGNANCY: 'PREGNANCY',
  BREASTFEEDING: 'BREASTFEEDING',
  CANCER_TREATMENT: 'CANCER_TREATMENT',
  RECENT_SURGERY: 'RECENT_SURGERY',
  EATING_DISORDER: 'EATING_DISORDER',
};

export function detectRedFlags(profile: SafetyProfileInput): RedFlag[] {
  const flags: RedFlag[] = [];
  const seen = new Set<RedFlagCode>();

  const add = (code: RedFlagCode, detail: string) => {
    if (seen.has(code)) return;
    seen.add(code);
    flags.push({ code, detail });
  };

  // Age. Both ends: children have different requirements entirely, and over 75
  // the interaction with medication and kidney function stops being routine.
  if (typeof profile.age === 'number') {
    if (profile.age < 18) add('AGE_UNDER_18', `age ${profile.age}`);
    else if (profile.age > 75) add('AGE_OVER_75', `age ${profile.age}`);
  }

  for (const raw of profile.medicalConditions) {
    const condition = raw.toUpperCase() as MedicalCondition;
    if (!RED_FLAG_CONDITIONS.has(condition)) continue;
    const code = CONDITION_TO_FLAG[condition];
    if (code) add(code, `condition ${condition}`);
  }

  // Medications and free-text notes are searched with the same keyword list;
  // "I take insulin" belongs in either field and people use both.
  const freeText = normaliseSearchText(
    [profile.medications ?? '', profile.notes ?? ''].join(' '),
  );

  if (freeText.length > 0) {
    for (const entry of KEYWORD_FLAGS) {
      const hit = entry.terms.find((term) => freeText.includes(normaliseSearchText(term)));
      if (hit) add(entry.code, `free text mentions "${hit}"`);
    }
  }

  return flags;
}

export interface SafetyAssessment {
  flaggedForReview: boolean;
  flags: RedFlag[];
  /** Stored on the plan; shown to the admin queue, not to the customer. */
  flagReason: string | null;
}

export function assessSafety(profile: SafetyProfileInput): SafetyAssessment {
  const flags = detectRedFlags(profile);

  return {
    flaggedForReview: flags.length > 0,
    flags,
    flagReason:
      flags.length > 0 ? flags.map((flag) => `${flag.code}: ${flag.detail}`).join('; ') : null,
  };
}

/**
 * S2 — consent is mandatory before a plan can be generated.
 *
 * Checked server-side on every generation, not only at intake. A profile saved
 * through the API without consent must not become a plan.
 */
export function hasValidConsent(profile: {
  consentGivenAt: Date | null;
  consentVersion: string | null;
}): boolean {
  return profile.consentGivenAt !== null && Boolean(profile.consentVersion);
}
