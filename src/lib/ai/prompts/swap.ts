import type { CandidateProduct } from '@/lib/meal-plan/candidates';
import { compressForPrompt } from '@/lib/meal-plan/candidates';

/**
 * AI-2 — swap suggestions (PART 6.1).
 *
 * R6 — versioned, like every prompt. Bump the version when the wording changes
 * in a way that could change output; never edit a released version in place.
 */
export const SWAP_PROMPT_VERSION = 'swap.v1';

const SYSTEM = `You suggest replacement vegetables for one meal in a weekly home-cooking plan in Maharashtra, India.

You are NOT a doctor or a dietitian. You never diagnose, never prescribe, and
never promise a health outcome.

RULES — all of them are absolute:
1. Suggest EXACTLY 3 vegetables, chosen ONLY from the provided catalogue.
   Return the exact "id" values given. An id outside the catalogue is a failed
   response.
2. All 3 must be different from each other.
3. Prefer something that cooks similarly to the vegetable being replaced, so
   the customer's plan for that meal still makes sense.
4. Each "reason" is ONE short sentence saying why this is a good stand-in.
   Never use the words prescription, treatment, cure, or medical advice.
   Never claim it will fix, heal or reverse anything.
5. Return JSON only. No markdown, no commentary, no code fences.`;

export interface SwapPromptInput {
  /** The vegetable being replaced, in English. */
  replacingName: string;
  /** Why the customer wants it gone — shapes what a good alternative is. */
  reasonCode: string;
  reasonText: string | null;
  slot: 'MORNING' | 'EVENING';
  /** Same privacy rules as AI-1: empty unless AI_ALLOW_REAL_HEALTH_DATA. */
  conditions: string[];
  goal: string;
  dietaryPreference: string;
}

const REASON_HINTS: Record<string, string> = {
  DONT_LIKE: 'The customer does not like it, so suggest something clearly different in taste.',
  ALLERGIC: 'The customer reacts to it. Suggest something from a different family entirely.',
  NOT_AVAILABLE: 'It was unavailable. Suggest the closest everyday substitutes.',
  TOO_EXPENSIVE: 'It costs too much. Prefer cheaper everyday vegetables.',
  OTHER: 'Suggest sensible alternatives for the same meal.',
};

export function buildSwapPrompt(
  input: SwapPromptInput,
  candidates: readonly CandidateProduct[],
): { system: string; user: string } {
  const catalogue = compressForPrompt(candidates);

  const lines = [
    `REPLACING: ${input.replacingName} (${input.slot} meal)`,
    `REASON: ${REASON_HINTS[input.reasonCode] ?? REASON_HINTS.OTHER}`,
    input.reasonText ? `CUSTOMER SAID: ${input.reasonText}` : null,
    '',
    'HOUSEHOLD',
    `- Diet: ${input.dietaryPreference}`,
    `- Goal: ${input.goal}`,
    input.conditions.length > 0 ? `- Reported conditions: ${input.conditions.join(', ')}` : null,
    '',
    'CATALOGUE — you may return only these ids:',
    JSON.stringify(catalogue),
    '',
    'Return JSON exactly in this shape:',
    JSON.stringify({
      suggestions: [
        { productId: '<id from the catalogue>', reason: '<one sentence>' },
        { productId: '<id from the catalogue>', reason: '<one sentence>' },
        { productId: '<id from the catalogue>', reason: '<one sentence>' },
      ],
    }),
  ].filter((line): line is string => line !== null);

  return { system: SYSTEM, user: lines.join('\n') };
}

/** R6 — the single retry gets the validation errors verbatim. */
export function buildSwapRetryUser(originalUser: string, errors: readonly string[]): string {
  return [
    originalUser,
    '',
    'YOUR PREVIOUS RESPONSE WAS REJECTED. Fix exactly these problems:',
    ...errors.map((error) => `- ${error}`),
    '',
    'Return the corrected JSON only.',
  ].join('\n');
}
