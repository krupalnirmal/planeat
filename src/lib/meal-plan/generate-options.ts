import { logAiCall } from '@/lib/ai/logger';
import {
  MEAL_PLAN_OPTIONS_PROMPT_VERSION,
  buildMealPlanOptionsPrompt,
  buildOptionsRetryUser,
} from '@/lib/ai/prompts/meal-plan-options';
import { ageBandOf } from '@/lib/ai/prompts/meal-plan';
import {
  mealPlanOptionsResponseSchema,
  type MealPlanOptionsResponse,
} from '@/lib/ai/schemas/meal-plan-options';
import { db } from '@/lib/db';
import { env } from '@/lib/env';
import { ID_PREFIX, newId } from '@/lib/ids';
import { computeQuantity, type QuantityUnit } from '@/lib/quantity';
import { getAIProvider } from '@/lib/services/ai';
import { SETTING_KEYS, getSettingNumber } from '@/lib/settings';
import type { Locale } from '@/generated/prisma/enums';
import { buildCandidates, type CandidateProduct } from './candidates';
import { NotEnoughCandidatesError } from './fallback';
import { MINIMUM_CANDIDATES_PER_CATEGORY, buildFallbackOptions } from './fallback-options';
import { assertNoForbiddenOptions, validateMealPlanOptionsResponse } from './validate-options';
import {
  DELIVERABLE_CATEGORIES,
  PLAN_CATEGORIES,
  SELECTION_TYPE,
  groupCandidatesByPlanCategory,
  type PlanCategoryCode,
} from './plan-categories';
import { assessSafety, hasValidConsent } from './safety';

/**
 * "Make My Meal Plan" options generation — the sibling of `generate.ts`,
 * producing 2-3 candidate options per day/category for the customer to
 * select from, instead of one AI-resolved pick. Same pipeline shape:
 *
 *   load profile (+ family members) → build per-category candidates
 *     → safety pre-check → LLM call, schema-constrained
 *     → validate + retry once → deterministic fallback
 *     → persist as MealPlanDraft (GENERATED)
 *
 * Deliberately does NOT touch MealPlanItem — that only happens when the
 * customer's selections are resolved via `finalizeMealPlanDraft` (finalize.ts).
 */

export type GenerateOptionsFailure =
  | { reason: 'NO_PROFILE' }
  | { reason: 'NO_CONSENT' }
  | { reason: 'NOT_ENOUGH_CANDIDATES'; category: PlanCategoryCode; available: number; required: number };

export type GenerateOptionsResult =
  | { ok: true; draftId: string; flaggedForReview: boolean; usedFallback: boolean }
  | ({ ok: false } & GenerateOptionsFailure);

export interface GenerateOptionsInput {
  userId: string;
  locale: Locale;
  /** Doc §13 — a chip-picked reason on regenerate, folded into the prompt's notes. */
  regenerateReason?: string | null;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

interface AttemptOutcome {
  response: MealPlanOptionsResponse | null;
  usedFallback: boolean;
  errors: string[];
}

/** R6 — one LLM call, one retry with errors fed back, then the deterministic fallback. */
async function generateWithAI(
  userId: string,
  system: string,
  user: string,
  candidatesByCategory: Record<PlanCategoryCode, CandidateProduct[]>,
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
        schema: mealPlanOptionsResponseSchema,
        temperature: 0.4,
        maxTokens: 8192,
      });

      const validation = validateMealPlanOptionsResponse(response, candidatesByCategory);

      if (validation.ok) {
        await logAiCall({
          userId,
          feature: 'MEAL_PLAN_GENERATION',
          provider: provider.name,
          model: provider.model,
          promptVersion: MEAL_PLAN_OPTIONS_PROMPT_VERSION,
          usage: provider.lastUsage(),
          status: attempt === 0 ? 'SUCCESS' : 'RETRIED',
        });
        return { response, usedFallback: false, errors: [] };
      }

      lastErrors = validation.errors;
      currentUser = buildOptionsRetryUser(user, validation.errors);

      await logAiCall({
        userId,
        feature: 'MEAL_PLAN_GENERATION',
        provider: provider.name,
        model: provider.model,
        promptVersion: MEAL_PLAN_OPTIONS_PROMPT_VERSION,
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
        promptVersion: MEAL_PLAN_OPTIONS_PROMPT_VERSION,
        usage: provider.lastUsage(),
        status: 'ERROR',
        error: lastErrors[0],
      });
    }
  }

  return { response: null, usedFallback: true, errors: lastErrors };
}

export async function generateMealPlanOptions(
  input: GenerateOptionsInput,
): Promise<GenerateOptionsResult> {
  // ── 1. Profile, consent, and (for a family plan) every member.
  const profile = await db.healthProfile.findUnique({
    where: { userId: input.userId },
    select: {
      id: true,
      planType: true,
      age: true,
      activityLevel: true,
      householdAdults: true,
      householdChildren: true,
      medicalConditions: true,
      allergies: true,
      medications: true,
      dietaryPreference: true,
      dislikedProductIds: true,
      goal: true,
      notes: true,
      familyPreferences: true,
      consentGivenAt: true,
      consentVersion: true,
    },
  });

  if (!profile) return { ok: false, reason: 'NO_PROFILE' };
  if (!hasValidConsent(profile)) return { ok: false, reason: 'NO_CONSENT' };

  const members =
    profile.planType === 'FAMILY'
      ? await db.familyMember.findMany({
          where: { healthProfileId: profile.id },
          orderBy: { sortOrder: 'asc' },
          select: { name: true, age: true, allergies: true, dislikedProductIds: true, medicalConditions: true },
        })
      : [];

  // Any member's allergy/dislike excludes an item for the whole household —
  // the doc's own rule ("handle it conservatively"), applied the same way
  // S4 already applies a single profile's allergies.
  const allergies = [
    ...stringArray(profile.allergies),
    ...members.flatMap((member) => stringArray(member.allergies)),
  ];
  const dislikedProductIds = [
    ...stringArray(profile.dislikedProductIds),
    ...members.flatMap((member) => stringArray(member.dislikedProductIds)),
  ];

  // ── 2. Per-category candidates, allergens/dislikes already stripped.
  const { candidates } = await buildCandidates({
    allergies,
    dislikedProductIds,
    dietaryPreference: profile.dietaryPreference,
    locale: input.locale,
  });

  const candidatesByCategory = groupCandidatesByPlanCategory(candidates);

  for (const category of PLAN_CATEGORIES) {
    const available = candidatesByCategory[category].length;
    if (available < MINIMUM_CANDIDATES_PER_CATEGORY) {
      return {
        ok: false,
        reason: 'NOT_ENOUGH_CANDIDATES',
        category,
        available,
        required: MINIMUM_CANDIDATES_PER_CATEGORY,
      };
    }
  }

  // ── 3. Safety pre-check, aggregated across the profile and every member.
  const conditions = stringArray(profile.medicalConditions);
  const safetyChecks = [
    assessSafety({
      age: profile.age,
      medicalConditions: conditions,
      medications: profile.medications,
      notes: profile.notes,
      goal: profile.goal,
    }),
    ...members.map((member) =>
      assessSafety({
        age: member.age,
        medicalConditions: stringArray(member.medicalConditions),
        medications: null,
        notes: null,
        goal: profile.goal,
      }),
    ),
  ];
  const flaggedBySafety = safetyChecks.some((check) => check.flaggedForReview);
  const safetyReason =
    safetyChecks
      .flatMap((check) => (check.flagReason ? [check.flagReason] : []))
      .join(' | ') || null;

  // ── 4. The prompt. Same R3/S6 gate as generate.ts.
  const allowRealHealthData = env.ai.allowRealHealthData;
  const familyPreferences = (profile.familyPreferences ?? {}) as { spicePreference?: string };

  const { system, user } = buildMealPlanOptionsPrompt(
    {
      planType: profile.planType,
      ageBand: ageBandOf(profile.age),
      householdAdults: profile.householdAdults,
      householdChildren: profile.householdChildren,
      memberSummaries: members.map(
        (member) =>
          `- ${member.name} (${ageBandOf(member.age)})${
            allowRealHealthData && stringArray(member.dislikedProductIds).length > 0
              ? `, dislikes noted separately`
              : ''
          }`,
      ),
      dietaryPreference: profile.dietaryPreference,
      goal: profile.goal,
      spicePreference: familyPreferences.spicePreference ?? null,
      conditions: allowRealHealthData ? conditions : [],
      notes: allowRealHealthData
        ? [profile.notes, input.regenerateReason].filter(Boolean).join('. ') || null
        : (input.regenerateReason ?? null),
    },
    candidatesByCategory,
  );

  // ── 5. Generate, validate, retry once, then fall back.
  const attempt = await generateWithAI(input.userId, system, user, candidatesByCategory);

  let response: MealPlanOptionsResponse;
  let usedFallback = attempt.usedFallback;

  if (attempt.response) {
    response = attempt.response;
  } else {
    try {
      response = buildFallbackOptions({
        candidatesByCategory,
        goal: profile.goal,
        conditions,
        seed: profile.id,
      });
      await logAiCall({
        userId: input.userId,
        feature: 'MEAL_PLAN_GENERATION',
        provider: 'rule-based',
        model: 'fallback-options.v1',
        promptVersion: MEAL_PLAN_OPTIONS_PROMPT_VERSION,
        usage: null,
        status: 'FALLBACK',
        error: attempt.errors.join(' | '),
      });
    } catch (error) {
      if (error instanceof NotEnoughCandidatesError) {
        return {
          ok: false,
          reason: 'NOT_ENOUGH_CANDIDATES',
          category: 'VEGETABLES',
          available: error.available,
          required: MINIMUM_CANDIDATES_PER_CATEGORY,
        };
      }
      throw error;
    }
    usedFallback = true;
  }

  // ── 6. S4's last line of defence, on whatever produced the plan.
  const allOptionIds = response.days.flatMap((day) =>
    day.categories.flatMap((entry) => entry.optionIds),
  );
  assertNoForbiddenOptions(allOptionIds, candidatesByCategory);

  // ── 7. Suggested quantity per option, computed in code (B4) — never trusted
  // from the AI. Only weighed/volume categories get one; PIECE/BUNCH/PACK
  // items get their own natural count via the same formula.
  const quantityConfig = await loadQuantityConfig();
  const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]));

  // ── 8. Persist. A fresh draft each time; regeneration marks the previous
  // one REGENERATED rather than deleting it (same "supersede, don't erase"
  // pattern as generate.ts's MealPlan versioning).
  const draftId = newId(ID_PREFIX.mealPlanDraft);
  const flaggedForReview = flaggedBySafety || response.flaggedForReview;
  const flagReason =
    [safetyReason, response.flaggedForReview ? response.flagReason : null].filter(Boolean).join(' | ') ||
    null;

  // Built up front as plain arrays and written with `createMany` — the app
  // runs against a remote TiDB (real network latency per round trip, seen
  // firsthand: seeding ~150 products one-by-one took minutes). A week's
  // worth of days/categories/options is ~150 rows; one `create()` per row
  // inside a single transaction blew past Prisma's 5s transaction timeout
  // (P2028) the first time this ran live. 3 batched writes instead of ~150
  // sequential ones.
  const dayRows: { id: string; draftId: string; dayNumber: number }[] = [];
  const categoryRows: {
    id: string;
    draftDayId: string;
    category: (typeof response.days)[number]['categories'][number]['category'];
    selectionType: 'SINGLE' | 'MULTIPLE';
  }[] = [];
  const optionRows: {
    id: string;
    categoryId: string;
    productId: string;
    variantId: string | null;
    suggestedQuantity: number | null;
    quantityUnit: string | null;
    sortOrder: number;
  }[] = [];

  for (const day of response.days) {
    const dayId = newId(ID_PREFIX.mealPlanDraftDay);
    dayRows.push({ id: dayId, draftId, dayNumber: day.dayNumber });

    for (const entry of day.categories) {
      const categoryId = newId(ID_PREFIX.mealPlanDraftCategory);
      categoryRows.push({
        id: categoryId,
        draftDayId: dayId,
        category: entry.category,
        selectionType: SELECTION_TYPE[entry.category],
      });

      for (const [index, productId] of entry.optionIds.entries()) {
        const candidate = byId.get(productId);
        if (!candidate) continue; // Unreachable — assertNoForbiddenOptions ran.

        const suggested = candidate.variant
          ? computeQuantity(
              { adults: profile.householdAdults, children: profile.householdChildren },
              candidate.unitType as QuantityUnit,
              quantityConfig,
            )
          : null;

        optionRows.push({
          id: newId(ID_PREFIX.mealPlanDraftOption),
          categoryId,
          productId: candidate.id,
          variantId: candidate.variant?.id ?? null,
          suggestedQuantity: suggested?.quantity ?? null,
          quantityUnit: suggested?.unit ?? null,
          sortOrder: index,
        });
      }
    }
  }

  const durationDays = await getSettingNumber(SETTING_KEYS.mealPlanDefaultDurationDays);

  await db.$transaction(
    async (tx) => {
      await tx.mealPlanDraft.updateMany({
        where: {
          userId: input.userId,
          status: { in: ['DRAFT', 'PROFILE_COMPLETED', 'GENERATING', 'GENERATED', 'SELECTING', 'FINAL_PREVIEW'] },
        },
        data: { status: 'REGENERATED' },
      });

      await tx.mealPlanDraft.create({
        data: {
          id: draftId,
          userId: input.userId,
          healthProfileId: profile.id,
          planType: profile.planType,
          durationDays,
          status: 'GENERATED',
          aiProvider: usedFallback ? 'rule-based' : getAIProvider().name,
          aiModel: usedFallback ? 'fallback-options.v1' : getAIProvider().model,
          promptVersion: MEAL_PLAN_OPTIONS_PROMPT_VERSION,
          flaggedForReview,
          flagReason,
        },
      });

      await tx.mealPlanDraftDay.createMany({ data: dayRows });
      await tx.mealPlanDraftCategory.createMany({ data: categoryRows });
      await tx.mealPlanDraftOption.createMany({ data: optionRows });
    },
    { timeout: 20_000 },
  );

  return { ok: true, draftId, flaggedForReview, usedFallback };
}

/** R8 — B4's constants are runtime-editable from the admin panel. Same loader as generate.ts. */
async function loadQuantityConfig() {
  const [servingGramsPerAdult, childServingMultiplier, roundingGrams, minGrams, maxGrams] =
    await Promise.all([
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

export { DELIVERABLE_CATEGORIES };
