import { DAYS_OF_WEEK, type MealPlanResponse } from '@/lib/ai/schemas/meal-plan';
import type { CandidateProduct } from './candidates';

/**
 * R6 — the deterministic rule-based fallback.
 *
 *   "…falls back to a deterministic rule-based result if it still fails."
 *
 * This is what stands between a customer and an empty screen when the AI is
 * rate-limited, down, or returning nonsense twice in a row. It is not a
 * degraded mode to be embarrassed about: a sensible rotation of in-season
 * vegetables is roughly what the owner was writing by hand before this app
 * existed.
 *
 * Deterministic on purpose — the same profile and catalogue always produce the
 * same plan, so a customer who regenerates does not get a lottery, and the
 * behaviour is testable.
 */

/** Tag-based affinities. Crude, transparent, and defensible — which is the point. */
export const GOAL_AFFINITIES: Record<string, readonly string[]> = {
  WEIGHT_LOSS: ['low-calorie', 'fibre', 'hydrating', 'leafy'],
  WEIGHT_GAIN: ['starchy', 'protein', 'energy'],
  MAINTENANCE: ['fibre', 'vitamin-c', 'vitamin-a'],
  GENERAL_HEALTH: ['fibre', 'vitamin-c', 'vitamin-a', 'iron'],
  MANAGE_CONDITION: ['fibre', 'diabetes-friendly', 'low-calorie'],
};

export const CONDITION_AFFINITIES: Record<string, readonly string[]> = {
  DIABETES_TYPE_2: ['diabetes-friendly', 'fibre', 'low-calorie'],
  DIABETES_TYPE_1: ['diabetes-friendly', 'fibre'],
  HYPERTENSION: ['low-calorie', 'hydrating', 'fibre'],
  ANAEMIA: ['iron', 'folate', 'anaemia'],
  CHOLESTEROL: ['fibre', 'cholesterol'],
  ACIDITY: ['hydrating', 'low-calorie'],
  PCOS: ['fibre', 'low-calorie', 'diabetes-friendly'],
  THYROID: ['fibre', 'vitamin-a'],
  JOINT_PAIN: ['anti-inflammatory', 'vitamin-c'],
  KIDNEY_DISEASE: ['kidney-friendly', 'hydrating', 'low-calorie'],
};

export interface FallbackInput {
  candidates: readonly CandidateProduct[];
  goal: string;
  conditions: readonly string[];
  /** Makes the rotation stable per customer without being random. */
  seed: string;
}

/** A tiny deterministic hash, so "seeded" never means "unpredictable". */
export function hash(input: string): number {
  let value = 2166136261;
  for (let i = 0; i < input.length; i++) {
    value ^= input.charCodeAt(i);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

export function scoreCandidate(
  candidate: CandidateProduct,
  wanted: ReadonlySet<string>,
  seed: number,
): number {
  const tags = new Set(candidate.tags.map((tag) => tag.toLowerCase()));

  let score = 0;
  for (const tag of wanted) {
    if (tags.has(tag)) score += 10;
  }

  // A stable per-candidate jitter so two equally-scored vegetables do not
  // always fall in alphabetical order — the same customer gets the same
  // rotation, different customers get different ones.
  score += (hash(`${seed}:${candidate.id}`) % 7) / 10;

  return score;
}

const RATIONALE_BY_TAG: Record<string, string> = {
  iron: 'A good source of iron.',
  fibre: 'High in fibre, and filling.',
  'vitamin-c': 'Rich in vitamin C.',
  'vitamin-a': 'A good source of vitamin A.',
  'low-calorie': 'Light and low in calories.',
  hydrating: 'Hydrating, and gentle on the stomach.',
  leafy: 'A leafy vegetable, best cooked early in the week.',
  protein: 'Adds plant protein to the meal.',
  'diabetes-friendly': 'Releases energy slowly.',
  folate: 'A good source of folate.',
  'anti-inflammatory': 'Traditionally used to ease stiffness.',
  antioxidant: 'Rich in antioxidants.',
  staple: 'An everyday staple for the kitchen.',
};

/**
 * S1 — no medical claims. These sentences describe what the vegetable offers
 * and nothing else; there is no "helps your diabetes" anywhere in this file.
 */
function rationaleFor(candidate: CandidateProduct): string {
  for (const tag of candidate.tags) {
    const sentence = RATIONALE_BY_TAG[tag.toLowerCase()];
    if (sentence) return sentence;
  }
  return 'A fresh, seasonal choice for this meal.';
}

export class NotEnoughCandidatesError extends Error {
  constructor(readonly available: number) {
    super(`Only ${available} vegetables are available; a week needs at least 7.`);
    this.name = 'NotEnoughCandidatesError';
  }
}

/**
 * Builds a full week: 7 days × 2 slots, no vegetable more than twice, leafy
 * items early.
 */
export function buildFallbackPlan(input: FallbackInput): MealPlanResponse {
  const { candidates } = input;

  // 14 slots, at most 2 uses each → 7 distinct vegetables is the hard floor.
  if (candidates.length < 7) {
    throw new NotEnoughCandidatesError(candidates.length);
  }

  const wanted = new Set<string>(GOAL_AFFINITIES[input.goal] ?? GOAL_AFFINITIES.GENERAL_HEALTH);
  for (const condition of input.conditions) {
    for (const tag of CONDITION_AFFINITIES[condition.toUpperCase()] ?? []) wanted.add(tag);
  }

  const seed = hash(input.seed);

  const ranked = [...candidates]
    .map((candidate) => ({ candidate, score: scoreCandidate(candidate, wanted, seed) }))
    .sort((a, b) => b.score - a.score || a.candidate.id.localeCompare(b.candidate.id))
    .map((entry) => entry.candidate);

  // Leafy greens wilt, so they go early in the week. Everything else keeps its
  // rank order.
  const leafy = ranked.filter((candidate) => candidate.tags.includes('leafy'));
  const rest = ranked.filter((candidate) => !candidate.tags.includes('leafy'));
  const ordered = [...leafy, ...rest];

  const uses = new Map<string, number>();
  const plan: MealPlanResponse['plan'] = [];

  // Walk the ordered list twice round, skipping anything already used twice.
  // With ≥7 candidates this always fills all 14 slots.
  let cursor = 0;
  function nextProduct(): CandidateProduct {
    for (let attempts = 0; attempts < ordered.length * 3; attempts++) {
      const candidate = ordered[cursor % ordered.length];
      cursor += 1;
      if ((uses.get(candidate.id) ?? 0) < 2) {
        uses.set(candidate.id, (uses.get(candidate.id) ?? 0) + 1);
        return candidate;
      }
    }
    // Unreachable with ≥7 candidates, but throwing beats returning a wrong
    // plan silently.
    throw new NotEnoughCandidatesError(ordered.length);
  }

  for (const dayOfWeek of DAYS_OF_WEEK) {
    const morning = nextProduct();
    const evening = nextProduct();

    plan.push({
      dayOfWeek,
      meals: [
        { slot: 'MORNING', productId: morning.id, rationale: rationaleFor(morning) },
        { slot: 'EVENING', productId: evening.id, rationale: rationaleFor(evening) },
      ],
    });
  }

  return {
    plan,
    overallNote:
      'A week of seasonal vegetables, varied across the days and balanced for colour and texture.',
    // The safety layer sets the real flag; the fallback never lowers it.
    flaggedForReview: false,
    flagReason: null,
  };
}
