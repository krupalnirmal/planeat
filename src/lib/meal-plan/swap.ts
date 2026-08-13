import { logAiCall } from '@/lib/ai/logger';
import { SWAP_PROMPT_VERSION, buildSwapPrompt, buildSwapRetryUser } from '@/lib/ai/prompts/swap';
import { swapSuggestionsSchema, type SwapSuggestions } from '@/lib/ai/schemas/meal-plan';
import { db } from '@/lib/db';
import { env } from '@/lib/env';
import { ID_PREFIX, newId } from '@/lib/ids';
import { computeQuantity, type QuantityUnit } from '@/lib/quantity';
import { getAIProvider } from '@/lib/services/ai';
import { SETTING_KEYS, getSettingNumber } from '@/lib/settings';
import type { Locale, SwapReasonCode } from '@/generated/prisma/enums';
import { buildCandidates, type CandidateProduct } from './candidates';

/**
 * B6 — swaps apply INSTANTLY, with no admin approval.
 *
 *   "Removing the dietitian was the point; rebuilding the approval wait would
 *    automate the paperwork and keep the bottleneck."
 *
 * `FEATURE_ADMIN_SWAP_APPROVAL` stays in the settings table for a future
 * change of mind, but nothing here reads it as a gate. Every swap is logged
 * and visible in admin — visibility without a gate.
 *
 * Two other B6 rules live here:
 *   - the rejected vegetable is auto-added to `disliked_product_ids`
 *   - a maximum of 10 swaps per plan per week
 */

export const SUGGESTION_COUNT = 3;

export type SwapSuggestFailure =
  | { reason: 'ITEM_NOT_FOUND' }
  | { reason: 'NO_PROFILE' }
  | { reason: 'LIMIT_REACHED'; used: number; limit: number }
  | { reason: 'NO_ALTERNATIVES' };

export interface SwapSuggestion {
  productId: string;
  name: string;
  imageUrl: string | null;
  reason: string;
  quantity: number;
  unit: string;
  pricePaise: bigint | null;
}

export type SwapSuggestResult =
  | { ok: true; swapRequestId: string; replacing: string; suggestions: SwapSuggestion[] }
  | ({ ok: false } & SwapSuggestFailure);

export interface SwapSuggestInput {
  mealPlanItemId: string;
  userId: string;
  reasonCode: SwapReasonCode;
  reasonText?: string | null;
  locale: Locale;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

/**
 * B6 — "Limit: 10 swaps per plan per week."
 *
 * Counted over APPLIED swaps in the last seven days, per plan. Suggestions that
 * were never confirmed do not count: asking what else is available is not the
 * thing being rate-limited, changing the plan is.
 */
async function countRecentSwaps(mealPlanId: string, now: Date): Promise<number> {
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000);

  return db.mealPlanSwapRequest.count({
    where: {
      status: 'APPLIED',
      resolvedAt: { gte: weekAgo },
      mealPlanItem: { day: { mealPlanId } },
    },
  });
}

/**
 * Deterministic fallback for AI-2, on the same terms as AI-1's (R6).
 *
 * Prefers candidates sharing tags with the vegetable being replaced, so a
 * leafy green is offered leafy greens. Being predictable is a feature: the
 * customer who swaps twice should not see a random shuffle.
 */
function fallbackSuggestions(
  replacing: CandidateProduct | null,
  candidates: readonly CandidateProduct[],
): SwapSuggestions {
  const wanted = new Set((replacing?.tags ?? []).map((tag) => tag.toLowerCase()));

  const ranked = [...candidates]
    .map((candidate) => {
      const shared = candidate.tags.filter((tag) => wanted.has(tag.toLowerCase())).length;
      return { candidate, score: shared };
    })
    .sort((a, b) => b.score - a.score || a.candidate.id.localeCompare(b.candidate.id));

  return {
    suggestions: ranked.slice(0, SUGGESTION_COUNT).map(({ candidate, score }) => ({
      productId: candidate.id,
      reason:
        score > 0
          ? 'Cooks much like the one you are replacing.'
          : 'A fresh, seasonal alternative for this meal.',
    })),
  };
}

/** Every suggestion must be in the candidate list, distinct, and exactly three. */
function validateSuggestions(
  response: SwapSuggestions,
  candidates: readonly CandidateProduct[],
  excludeProductId: string,
): string[] {
  const allowed = new Set(candidates.map((candidate) => candidate.id));
  const errors: string[] = [];
  const seen = new Set<string>();

  for (const suggestion of response.suggestions) {
    if (!allowed.has(suggestion.productId)) {
      errors.push(`Product id "${suggestion.productId}" is not in the catalogue you were given.`);
    }
    if (suggestion.productId === excludeProductId) {
      errors.push('One suggestion is the same vegetable that is being replaced.');
    }
    if (seen.has(suggestion.productId)) {
      errors.push(`Product id "${suggestion.productId}" is suggested more than once.`);
    }
    seen.add(suggestion.productId);
  }

  const banned = /\b(prescri\w*|treatment|cure[sd]?|medical advice|diagnos\w*)\b/i;
  for (const suggestion of response.suggestions) {
    if (banned.test(suggestion.reason)) {
      errors.push('A reason uses medical wording that is not allowed.');
    }
  }

  return errors;
}

export async function suggestSwaps(input: SwapSuggestInput): Promise<SwapSuggestResult> {
  const item = await db.mealPlanItem.findUnique({
    where: { id: input.mealPlanItemId },
    select: {
      id: true,
      slot: true,
      productId: true,
      day: { select: { mealPlanId: true, mealPlan: { select: { userId: true } } } },
    },
  });

  // R9 — ownership is checked here, not by trusting the id in the URL.
  if (!item || item.day.mealPlan.userId !== input.userId) {
    return { ok: false, reason: 'ITEM_NOT_FOUND' };
  }

  const profile = await db.healthProfile.findUnique({
    where: { userId: input.userId },
    select: {
      allergies: true,
      dislikedProductIds: true,
      dietaryPreference: true,
      medicalConditions: true,
      goal: true,
      householdAdults: true,
      householdChildren: true,
    },
  });

  if (!profile) return { ok: false, reason: 'NO_PROFILE' };

  const limit = await getSettingNumber(SETTING_KEYS.maxSwapsPerPlanPerWeek);
  const used = await countRecentSwaps(item.day.mealPlanId, new Date());
  if (used >= limit) return { ok: false, reason: 'LIMIT_REACHED', used, limit };

  // The same hard filters as generation (S4), plus the vegetable being
  // replaced — offering it back would be absurd — and anything already used
  // twice this week, which would break the business rule on confirm.
  const usedTwice = await productsUsedTwice(item.day.mealPlanId);

  const { candidates } = await buildCandidates({
    allergies: stringArray(profile.allergies),
    dislikedProductIds: stringArray(profile.dislikedProductIds),
    dietaryPreference: profile.dietaryPreference,
    locale: input.locale,
  });

  const eligible = candidates.filter(
    (candidate) => candidate.id !== item.productId && !usedTwice.has(candidate.id),
  );

  if (eligible.length < SUGGESTION_COUNT) {
    return { ok: false, reason: 'NO_ALTERNATIVES' };
  }

  const replacing = candidates.find((candidate) => candidate.id === item.productId) ?? null;
  const replacingName =
    replacing?.nameEn ??
    (await db.product.findUnique({ where: { id: item.productId }, select: { nameEn: true } }))
      ?.nameEn ??
    'the current vegetable';

  const allowRealHealthData = env.ai.allowRealHealthData;

  const { system, user } = buildSwapPrompt(
    {
      replacingName,
      reasonCode: input.reasonCode,
      reasonText: allowRealHealthData ? (input.reasonText ?? null) : null,
      slot: item.slot,
      conditions: allowRealHealthData ? stringArray(profile.medicalConditions) : [],
      goal: profile.goal,
      dietaryPreference: profile.dietaryPreference,
    },
    eligible,
  );

  const response = await generateSuggestions(
    input.userId,
    system,
    user,
    eligible,
    item.productId,
    replacing,
  );

  const byId = new Map(eligible.map((candidate) => [candidate.id, candidate]));

  const suggestions: SwapSuggestion[] = response.suggestions
    .map((suggestion): SwapSuggestion | null => {
      const candidate = byId.get(suggestion.productId);
      if (!candidate) return null;

      // B4 again — the quantity for the replacement is recomputed, never
      // inherited. A bunch of coriander and a kilo of potatoes are not the
      // same amount.
      const quantity = computeQuantity(
        { adults: profile.householdAdults, children: profile.householdChildren },
        candidate.unitType as QuantityUnit,
      );

      return {
        productId: candidate.id,
        name: candidate.name,
        imageUrl: null,
        reason: suggestion.reason,
        quantity: quantity.quantity,
        unit: quantity.unit,
        pricePaise: candidate.variant?.pricePaise ?? null,
      };
    })
    .filter((suggestion): suggestion is SwapSuggestion => suggestion !== null);

  const swapRequestId = newId(ID_PREFIX.swapRequest);

  await db.mealPlanSwapRequest.create({
    data: {
      id: swapRequestId,
      mealPlanItemId: item.id,
      userId: input.userId,
      reasonCode: input.reasonCode,
      reasonText: input.reasonText ?? null,
      status: 'SUGGESTED',
      // B6 — every swap is logged and visible in admin.
      aiSuggestions: suggestions.map((suggestion) => ({
        productId: suggestion.productId,
        name: suggestion.name,
        reason: suggestion.reason,
      })),
    },
  });

  return { ok: true, swapRequestId, replacing: replacingName, suggestions };
}

/** Products already appearing twice — swapping in a third would break the rule. */
async function productsUsedTwice(mealPlanId: string): Promise<Set<string>> {
  const items = await db.mealPlanItem.findMany({
    where: { day: { mealPlanId } },
    select: { productId: true },
  });

  const counts = new Map<string, number>();
  for (const item of items) counts.set(item.productId, (counts.get(item.productId) ?? 0) + 1);

  return new Set([...counts.entries()].filter(([, count]) => count >= 2).map(([id]) => id));
}

/** R6 — one call, one retry with the errors fed back, then the fallback. */
async function generateSuggestions(
  userId: string,
  system: string,
  user: string,
  candidates: readonly CandidateProduct[],
  excludeProductId: string,
  replacing: CandidateProduct | null,
): Promise<SwapSuggestions> {
  const provider = getAIProvider();
  const maxRetries = Math.max(0, env.ai.maxRetries);
  let currentUser = user;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await provider.generateJSON({
        system,
        user: currentUser,
        schema: swapSuggestionsSchema,
        temperature: 0.4,
        maxTokens: 1024,
      });

      const errors = validateSuggestions(response, candidates, excludeProductId);

      if (errors.length === 0) {
        await logAiCall({
          userId,
          feature: 'SWAP_SUGGESTION',
          provider: provider.name,
          model: provider.model,
          promptVersion: SWAP_PROMPT_VERSION,
          usage: provider.lastUsage(),
          status: attempt === 0 ? 'SUCCESS' : 'RETRIED',
        });
        return response;
      }

      currentUser = buildSwapRetryUser(user, errors);

      await logAiCall({
        userId,
        feature: 'SWAP_SUGGESTION',
        provider: provider.name,
        model: provider.model,
        promptVersion: SWAP_PROMPT_VERSION,
        usage: provider.lastUsage(),
        status: 'VALIDATION_FAILED',
        error: errors.join(' | '),
      });
    } catch (error) {
      await logAiCall({
        userId,
        feature: 'SWAP_SUGGESTION',
        provider: provider.name,
        model: provider.model,
        promptVersion: SWAP_PROMPT_VERSION,
        usage: provider.lastUsage(),
        status: 'ERROR',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  await logAiCall({
    userId,
    feature: 'SWAP_SUGGESTION',
    provider: 'rule-based',
    model: 'fallback.v1',
    promptVersion: SWAP_PROMPT_VERSION,
    usage: null,
    status: 'FALLBACK',
  });

  return fallbackSuggestions(replacing, candidates);
}

// ─────────────────────────────────────────────────────────────
// Confirm — B6's "applied immediately"
// ─────────────────────────────────────────────────────────────

export type SwapConfirmResult =
  | {
      ok: true;
      mealPlanItemId: string;
      productId: string;
      name: string;
      quantity: number;
      unit: string;
    }
  | {
      ok: false;
      reason: 'REQUEST_NOT_FOUND' | 'ALREADY_RESOLVED' | 'NOT_SUGGESTED' | 'UNSAFE';
    };

export interface SwapConfirmInput {
  swapRequestId: string;
  userId: string;
  productId: string;
  locale: Locale;
}

export async function confirmSwap(input: SwapConfirmInput): Promise<SwapConfirmResult> {
  const request = await db.mealPlanSwapRequest.findUnique({
    where: { id: input.swapRequestId },
    select: {
      id: true,
      userId: true,
      status: true,
      aiSuggestions: true,
      mealPlanItem: {
        select: {
          id: true,
          productId: true,
          slot: true,
          day: { select: { mealPlanId: true } },
        },
      },
    },
  });

  if (!request || request.userId !== input.userId) {
    return { ok: false, reason: 'REQUEST_NOT_FOUND' };
  }
  if (request.status !== 'SUGGESTED') return { ok: false, reason: 'ALREADY_RESOLVED' };

  // The chosen product must be one we actually offered. Without this the
  // endpoint would let a client put any product into the plan, bypassing every
  // filter that produced the suggestions.
  const offered = Array.isArray(request.aiSuggestions)
    ? request.aiSuggestions
        .map((entry) =>
          entry && typeof entry === 'object' && 'productId' in entry
            ? String((entry as { productId: unknown }).productId)
            : null,
        )
        .filter((id): id is string => id !== null)
    : [];

  if (!offered.includes(input.productId)) return { ok: false, reason: 'NOT_SUGGESTED' };

  const profile = await db.healthProfile.findUnique({
    where: { userId: input.userId },
    select: {
      allergies: true,
      dislikedProductIds: true,
      dietaryPreference: true,
      householdAdults: true,
      householdChildren: true,
    },
  });

  if (!profile) return { ok: false, reason: 'REQUEST_NOT_FOUND' };

  // S4 — re-validated at confirm time, not trusted from when the suggestions
  // were made. Stock can run out and the profile can change in between.
  const { candidates } = await buildCandidates({
    allergies: stringArray(profile.allergies),
    dislikedProductIds: stringArray(profile.dislikedProductIds),
    dietaryPreference: profile.dietaryPreference,
    locale: input.locale,
  });

  const chosen = candidates.find((candidate) => candidate.id === input.productId);
  if (!chosen) return { ok: false, reason: 'UNSAFE' };

  const quantity = computeQuantity(
    { adults: profile.householdAdults, children: profile.householdChildren },
    chosen.unitType as QuantityUnit,
  );

  const rejectedProductId = request.mealPlanItem.productId;
  const disliked = stringArray(profile.dislikedProductIds);

  await db.$transaction(async (tx) => {
    await tx.mealPlanItem.update({
      where: { id: request.mealPlanItem.id },
      data: {
        productId: chosen.id,
        variantId: chosen.variant?.id ?? null,
        quantity: quantity.quantity,
        unit: quantity.unit,
        // The old rationale described the old vegetable; keeping it would be
        // worse than having none.
        rationale: null,
      },
    });

    await tx.mealPlanSwapRequest.update({
      where: { id: request.id },
      data: { status: 'APPLIED', chosenProductId: chosen.id, resolvedAt: new Date() },
    });

    // B6 — "The rejected vegetable is auto-added to disliked_product_ids."
    //
    // Only for reasons that actually mean "not this one". A swap because it was
    // out of stock or expensive this week should not blacklist a vegetable the
    // customer likes.
    const shouldLearn = ['DONT_LIKE', 'ALLERGIC'].includes(
      (await tx.mealPlanSwapRequest.findUniqueOrThrow({
        where: { id: request.id },
        select: { reasonCode: true },
      })).reasonCode,
    );

    if (shouldLearn && !disliked.includes(rejectedProductId)) {
      await tx.healthProfile.update({
        where: { userId: input.userId },
        data: { dislikedProductIds: [...disliked, rejectedProductId] },
      });
    }
  });

  return {
    ok: true,
    mealPlanItemId: request.mealPlanItem.id,
    productId: chosen.id,
    name: chosen.name,
    quantity: quantity.quantity,
    unit: quantity.unit,
  };
}
