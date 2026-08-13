import { logAiCall } from '@/lib/ai/logger';
import {
  MEAL_PLAN_PROMPT_VERSION,
  ageBandOf,
  buildMealPlanPrompt,
  buildRetryUser,
} from '@/lib/ai/prompts/meal-plan';
import {
  DAY_NUMBER,
  mealPlanResponseSchema,
  type MealPlanResponse,
} from '@/lib/ai/schemas/meal-plan';
import { db } from '@/lib/db';
import { env } from '@/lib/env';
import { ID_PREFIX, newId } from '@/lib/ids';
import { TEMPLATE, notifyEvent } from '@/lib/notifications/notify';
import { computeQuantity, type QuantityUnit } from '@/lib/quantity';
import { getAIProvider } from '@/lib/services/ai';
import { SETTING_KEYS, getSettingNumber } from '@/lib/settings';
import type { Locale } from '@/generated/prisma/enums';
import { MINIMUM_CANDIDATES, buildCandidates, type CandidateProduct } from './candidates';
import { NotEnoughCandidatesError, buildFallbackPlan } from './fallback';
import { assessSafety, hasValidConsent } from './safety';
import { assertNoForbiddenProducts, validateMealPlanResponse } from './validate';

/**
 * PART 6.3 — the generation pipeline, in order:
 *
 *   load profile + meal-plan-eligible catalogue
 *     → strip allergens and dislikes from candidates
 *     → safety pre-check (red flags)
 *     → LLM call, schema-constrained
 *     → Zod validation + business rules
 *     → fail → retry once with error feedback → fail again → rule-based fallback
 *     → apply B4 quantity formula
 *     → save as MealPlan (PENDING_CUSTOMER)
 *
 * The order matters. Filtering before the call is what makes S4 a code
 * guarantee rather than a prompt-level hope, and the safety pre-check runs
 * deterministically so the flag never depends on a model noticing anything.
 */

export type GenerateFailure =
  | { reason: 'NO_PROFILE' }
  | { reason: 'NO_CONSENT' }
  | { reason: 'NOT_ENOUGH_CANDIDATES'; available: number; required: number };

export type GenerateResult =
  | {
      ok: true;
      mealPlanId: string;
      version: number;
      flaggedForReview: boolean;
      usedFallback: boolean;
    }
  | ({ ok: false } & GenerateFailure);

export interface GenerateInput {
  userId: string;
  locale: Locale;
}

interface AttemptOutcome {
  response: MealPlanResponse | null;
  usedFallback: boolean;
  errors: string[];
}

/**
 * R6 — one LLM call, one retry with the validation errors fed back, then the
 * deterministic fallback. Exactly one retry: a model that fails twice on the
 * same catalogue is not going to succeed on the third attempt, and the
 * customer is waiting.
 */
async function generateWithAI(
  userId: string,
  system: string,
  user: string,
  candidates: readonly CandidateProduct[],
): Promise<AttemptOutcome> {
  const provider = getAIProvider();
  const maxRetries = Math.max(0, env.ai.maxRetries);

  let lastErrors: string[] = [];
  let currentUser = user;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await provider.generateJSON({
        system,
        user: currentUser,
        schema: mealPlanResponseSchema,
        // PART 6.3 rule 4 — low temperature for structured extraction.
        temperature: 0.3,
        maxTokens: 4096,
      });

      const validation = validateMealPlanResponse(response, candidates);

      if (validation.ok) {
        await logAiCall({
          userId,
          feature: 'MEAL_PLAN_GENERATION',
          provider: provider.name,
          model: provider.model,
          promptVersion: MEAL_PLAN_PROMPT_VERSION,
          usage: provider.lastUsage(),
          status: attempt === 0 ? 'SUCCESS' : 'RETRIED',
        });
        return { response, usedFallback: false, errors: [] };
      }

      lastErrors = validation.errors;
      currentUser = buildRetryUser(user, validation.errors);

      await logAiCall({
        userId,
        feature: 'MEAL_PLAN_GENERATION',
        provider: provider.name,
        model: provider.model,
        promptVersion: MEAL_PLAN_PROMPT_VERSION,
        usage: provider.lastUsage(),
        status: 'VALIDATION_FAILED',
        error: validation.errors.join(' | '),
      });
    } catch (error) {
      lastErrors = [error instanceof Error ? error.message : String(error)];

      await logAiCall({
        userId,
        feature: 'MEAL_PLAN_GENERATION',
        provider: provider.name,
        model: provider.model,
        promptVersion: MEAL_PLAN_PROMPT_VERSION,
        usage: provider.lastUsage(),
        status: 'ERROR',
        error: lastErrors[0],
      });
    }
  }

  return { response: null, usedFallback: true, errors: lastErrors };
}

export async function generateMealPlan(input: GenerateInput): Promise<GenerateResult> {
  // ── 1. Profile and consent.
  const profile = await db.healthProfile.findUnique({
    where: { userId: input.userId },
    select: {
      id: true,
      age: true,
      gender: true,
      heightCm: true,
      weightKg: true,
      activityLevel: true,
      householdAdults: true,
      householdChildren: true,
      medicalConditions: true,
      allergies: true,
      medications: true,
      dietaryPreference: true,
      likedProductIds: true,
      dislikedProductIds: true,
      goal: true,
      notes: true,
      consentGivenAt: true,
      consentVersion: true,
    },
  });

  if (!profile) return { ok: false, reason: 'NO_PROFILE' };

  // S2 — checked server-side on every generation, not only at intake.
  if (!hasValidConsent(profile)) return { ok: false, reason: 'NO_CONSENT' };

  const asStringArray = (value: unknown): string[] =>
    Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];

  const allergies = asStringArray(profile.allergies);
  const dislikedProductIds = asStringArray(profile.dislikedProductIds);
  const conditions = asStringArray(profile.medicalConditions);

  // ── 2. Candidates, with allergens and dislikes already removed.
  const { candidates, excluded } = await buildCandidates({
    allergies,
    dislikedProductIds,
    dietaryPreference: profile.dietaryPreference,
    locale: input.locale,
  });

  if (candidates.length < MINIMUM_CANDIDATES) {
    return {
      ok: false,
      reason: 'NOT_ENOUGH_CANDIDATES',
      available: candidates.length,
      required: MINIMUM_CANDIDATES,
    };
  }

  // ── 3. Safety pre-check (S3). Deterministic, before any model sees anything.
  const safety = assessSafety({
    age: profile.age,
    medicalConditions: conditions,
    medications: profile.medications,
    notes: profile.notes,
    goal: profile.goal,
  });

  // ── 4. The prompt.
  //
  // R3 / S6 — with AI_ALLOW_REAL_HEALTH_DATA off, conditions, medications and
  // free-text notes never reach the model. It loses little: allergies and
  // dislikes were already removed from the catalogue in code, so the only cost
  // is a slightly less specific rationale.
  const allowRealHealthData = env.ai.allowRealHealthData;

  const { system, user } = buildMealPlanPrompt(
    {
      ageBand: ageBandOf(profile.age),
      gender: profile.gender,
      activityLevel: profile.activityLevel,
      householdAdults: profile.householdAdults,
      householdChildren: profile.householdChildren,
      dietaryPreference: profile.dietaryPreference,
      goal: profile.goal,
      conditions: allowRealHealthData ? conditions : [],
      notes: allowRealHealthData ? profile.notes : null,
    },
    candidates,
  );

  // ── 5. Generate, validate, retry once, then fall back.
  const attempt = await generateWithAI(input.userId, system, user, candidates);

  let response: MealPlanResponse;
  let usedFallback = attempt.usedFallback;

  if (attempt.response) {
    response = attempt.response;
  } else {
    try {
      response = buildFallbackPlan({
        candidates,
        goal: profile.goal,
        conditions,
        seed: profile.id,
      });
      await logAiCall({
        userId: input.userId,
        feature: 'MEAL_PLAN_GENERATION',
        provider: 'rule-based',
        model: 'fallback.v1',
        promptVersion: MEAL_PLAN_PROMPT_VERSION,
        usage: null,
        status: 'FALLBACK',
        error: attempt.errors.join(' | '),
      });
    } catch (error) {
      if (error instanceof NotEnoughCandidatesError) {
        return {
          ok: false,
          reason: 'NOT_ENOUGH_CANDIDATES',
          available: error.available,
          required: MINIMUM_CANDIDATES,
        };
      }
      throw error;
    }
    usedFallback = true;
  }

  // ── 6. S4's last line of defence, on whatever produced the plan.
  const allProductIds = response.plan.flatMap((day) => day.meals.map((meal) => meal.productId));
  assertNoForbiddenProducts(allProductIds, candidates);

  // ── 7. B4 quantity, computed in code. The model never returns grams.
  const quantityConfig = await loadQuantityConfig();
  const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]));

  // The AI may raise a flag we did not; it can never lower ours.
  const flaggedForReview = safety.flaggedForReview || response.flaggedForReview;
  const flagReason =
    [safety.flagReason, response.flaggedForReview ? response.flagReason : null]
      .filter(Boolean)
      .join(' | ') || null;

  // ── 8. Persist. A new version each time; the previous one is superseded.
  const previous = await db.mealPlan.findFirst({
    where: { userId: input.userId },
    orderBy: { version: 'desc' },
    select: { version: true },
  });
  const version = (previous?.version ?? 0) + 1;
  const mealPlanId = newId(ID_PREFIX.mealPlan);

  await db.$transaction(async (tx) => {
    // B5 — a running subscription switches at the next Monday, never
    // mid-week, so old plans are superseded rather than deleted. Phase 6 reads
    // this history when it decides which template today's order comes from.
    await tx.mealPlan.updateMany({
      where: { userId: input.userId, status: { in: ['DRAFT', 'PENDING_CUSTOMER'] } },
      data: { status: 'SUPERSEDED' },
    });

    await tx.mealPlan.create({
      data: {
        id: mealPlanId,
        userId: input.userId,
        version,
        // A snapshot, so a plan can always be explained by the profile that
        // produced it — even after the customer edits their profile.
        profileSnapshot: {
          age: profile.age,
          gender: profile.gender,
          activityLevel: profile.activityLevel,
          householdAdults: profile.householdAdults,
          householdChildren: profile.householdChildren,
          medicalConditions: conditions,
          allergies,
          dietaryPreference: profile.dietaryPreference,
          goal: profile.goal,
          consentVersion: profile.consentVersion,
          excludedCount: excluded.length,
        },
        status: 'PENDING_CUSTOMER',
        generatedBy: 'AI',
        aiProvider: usedFallback ? 'rule-based' : getAIProvider().name,
        aiModel: usedFallback ? 'fallback.v1' : getAIProvider().model,
        promptVersion: MEAL_PLAN_PROMPT_VERSION,
        overallNote: response.overallNote,
        flaggedForReview,
        flagReason,
      },
    });

    for (const day of response.plan) {
      const dayId = newId(ID_PREFIX.mealPlanDay);

      await tx.mealPlanDay.create({
        data: { id: dayId, mealPlanId, dayOfWeek: DAY_NUMBER[day.dayOfWeek] },
      });

      for (const [index, meal] of day.meals.entries()) {
        const candidate = byId.get(meal.productId);
        if (!candidate) continue; // Unreachable — assertNoForbiddenProducts ran.

        const quantity = computeQuantity(
          {
            adults: profile.householdAdults,
            children: profile.householdChildren,
          },
          candidate.unitType as QuantityUnit,
          quantityConfig,
        );

        await tx.mealPlanItem.create({
          data: {
            id: newId(ID_PREFIX.mealPlanItem),
            mealPlanDayId: dayId,
            slot: meal.slot,
            productId: candidate.id,
            variantId: candidate.variant?.id ?? null,
            quantity: quantity.quantity,
            unit: quantity.unit,
            rationale: meal.rationale,
            sortOrder: index,
          },
        });
      }
    }
  });

  // M8 — "Meal plan ready" (Push + in-app). Outside the transaction: a failed
  // notification must never undo a plan that generated successfully.
  await notifyEvent(input.userId, TEMPLATE.mealPlanReady, { mealPlanId, flaggedForReview });

  return { ok: true, mealPlanId, version, flaggedForReview, usedFallback };
}

/** R8 — B4's constants are runtime-editable from the admin panel. */
async function loadQuantityConfig() {
  const [
    servingGramsPerAdult,
    childServingMultiplier,
    roundingGrams,
    minGrams,
    maxGrams,
  ] = await Promise.all([
    getSettingNumber(SETTING_KEYS.servingGramsPerAdult),
    getSettingNumber(SETTING_KEYS.childServingMultiplier),
    getSettingNumber(SETTING_KEYS.quantityRoundingGrams),
    getSettingNumber(SETTING_KEYS.quantityMinGrams),
    getSettingNumber(SETTING_KEYS.quantityMaxGrams),
  ]);

  return {
    servingGramsPerAdult,
    childServingMultiplier,
    roundingGrams,
    minGrams,
    maxGrams,
    servingUnitsPerBunch: 4,
  };
}
