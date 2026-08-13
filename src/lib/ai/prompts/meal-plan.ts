import type { CandidateProduct } from '@/lib/meal-plan/candidates';
import { compressForPrompt } from '@/lib/meal-plan/candidates';

/**
 * The AI-1 prompt (PART 6.3), versioned.
 *
 * R6 — "Version every prompt file." The version is stored on every generated
 * plan and in `ai_generation_logs`, so a plan that reads oddly six months from
 * now can be traced to the exact wording that produced it.
 *
 * Bump the version whenever the wording changes in a way that could change
 * output. Never edit a released version in place.
 */
export const MEAL_PLAN_PROMPT_VERSION = 'meal-plan.v1';

/**
 * S1 — the model is told, in its own instructions, never to use the words
 * prescription / treatment / cure / medical advice. That is a second line of
 * defence, not the first: the UI strings are translated by us and the
 * rationale is length-capped and displayed as a suggestion.
 */
const SYSTEM = `You choose vegetables for a weekly home-cooking plan in Maharashtra, India.

You are NOT a doctor or a dietitian. You never diagnose, never prescribe, and
never promise a health outcome. You suggest vegetables, nothing more.

RULES — all of them are absolute:
1. Choose ONLY from the provided catalogue. Return the exact "id" values given.
   An id that is not in the catalogue is a failed response.
2. Fill all 7 days, each with exactly 2 meals: one MORNING and one EVENING.
3. Do not use the same vegetable more than TWICE across the whole week.
4. Vary colour, texture and cooking style across the week. An Indian household
   cooking the same two vegetables all week will stop following the plan.
5. Each "rationale" is ONE short sentence in plain English, describing what the
   vegetable offers. Never use the words prescription, treatment, cure, or
   medical advice. Never claim it will fix, heal or reverse anything.
6. Leafy vegetables wilt: place them early in the week.
7. Return JSON only. No markdown, no commentary, no code fences.`;

export interface MealPlanPromptProfile {
  /** A band, never an exact age — see the privacy note below. */
  ageBand: string;
  gender: string | null;
  activityLevel: string | null;
  householdAdults: number;
  householdChildren: number;
  dietaryPreference: string;
  goal: string;
  /**
   * S6 / R3 — only populated when `AI_ALLOW_REAL_HEALTH_DATA` is true.
   *
   * With the gate off these stay empty and the model plans from the coarse
   * signals above. It loses nothing it strictly needs: allergies and dislikes
   * were already removed from the catalogue in code (PART 6.3 rule 3), so the
   * only cost is a slightly less specific rationale.
   */
  conditions: string[];
  notes: string | null;
}

export function buildMealPlanPrompt(
  profile: MealPlanPromptProfile,
  candidates: readonly CandidateProduct[],
): { system: string; user: string } {
  const catalogue = compressForPrompt(candidates);

  const household =
    profile.householdChildren > 0
      ? `${profile.householdAdults} adults and ${profile.householdChildren} children`
      : `${profile.householdAdults} adults`;

  const lines = [
    'HOUSEHOLD',
    `- Cooking for: ${household}`,
    `- Age band: ${profile.ageBand}`,
    profile.gender ? `- Gender: ${profile.gender}` : null,
    profile.activityLevel ? `- Activity level: ${profile.activityLevel}` : null,
    `- Diet: ${profile.dietaryPreference}`,
    `- Goal: ${profile.goal}`,
    profile.conditions.length > 0
      ? `- Reported conditions: ${profile.conditions.join(', ')}`
      : null,
    profile.notes ? `- Notes: ${profile.notes}` : null,
    '',
    'CATALOGUE — you may return only these ids:',
    JSON.stringify(catalogue),
    '',
    'Return JSON exactly in this shape:',
    JSON.stringify(
      {
        plan: [
          {
            dayOfWeek: 'MONDAY',
            meals: [
              { slot: 'MORNING', productId: '<id from the catalogue>', rationale: '<one sentence>' },
              { slot: 'EVENING', productId: '<id from the catalogue>', rationale: '<one sentence>' },
            ],
          },
        ],
        overallNote: '<one or two sentences about the week as a whole>',
        flaggedForReview: false,
        flagReason: null,
      },
      null,
      0,
    ),
    '',
    'The "plan" array must contain all 7 days, MONDAY through SUNDAY.',
    'Set flaggedForReview to true only if something in the household details',
    'genuinely warrants a doctor looking at this, and explain briefly in',
    'flagReason. Otherwise false and null.',
  ].filter((line): line is string => line !== null);

  return { system: SYSTEM, user: lines.join('\n') };
}

/**
 * Fed back verbatim on the single retry (R6: "retried exactly once with the
 * validation error fed back"). Being specific about what was wrong is the
 * whole point — "invalid response" produces the same invalid response again.
 */
export function buildRetryUser(originalUser: string, errors: readonly string[]): string {
  return [
    originalUser,
    '',
    'YOUR PREVIOUS RESPONSE WAS REJECTED. Fix exactly these problems:',
    ...errors.map((error) => `- ${error}`),
    '',
    'Return the corrected JSON only.',
  ].join('\n');
}

/** Coarse age bands, so an exact date of birth never reaches a model. */
export function ageBandOf(age: number | null): string {
  if (age === null) return 'unknown';
  if (age < 18) return 'under 18';
  if (age <= 30) return '18-30';
  if (age <= 45) return '31-45';
  if (age <= 60) return '46-60';
  if (age <= 75) return '61-75';
  return 'over 75';
}
