import { pickName } from '@/lib/catalog/text';
import { db } from '@/lib/db';
import { computeQuantity, type QuantityUnit } from '@/lib/quantity';
import type { Locale, MealPlanStatus, MealSlot } from '@/generated/prisma/enums';
import { audit } from './audit';

/**
 * M9 — Meal Plans: all plans, view, regenerate, manual edit, flagged review
 * queue. Plus the swap log (B6: a log view, with no approval gate).
 *
 * B8 — a flagged plan is a customer whose profile said something a doctor
 * should see. The queue is the second layer under the banner and the
 * disclaimer; the customer is not blocked while it waits.
 *
 * S7 — "Admin can always edit a plan manually. The manual path from the old
 * business must remain available." That is what `replacePlanItem` is for.
 */

export interface AdminPlanRow {
  id: string;
  version: number;
  status: MealPlanStatus;
  customerId: string;
  customerName: string;
  customerPhone: string;
  flaggedForReview: boolean;
  /** Admin-only: the clinical detail the customer never sees (D-108). */
  flagReason: string | null;
  reviewedAt: Date | null;
  reviewedBy: string | null;
  aiProvider: string | null;
  promptVersion: string | null;
  createdAt: Date;
  hasSubscription: boolean;
}

export async function listMealPlans(
  filter: { flaggedOnly?: boolean; unreviewedOnly?: boolean; query?: string },
  { skip, take }: { skip: number; take: number },
): Promise<{ plans: AdminPlanRow[]; total: number }> {
  const where = {
    ...(filter.flaggedOnly ? { flaggedForReview: true } : {}),
    ...(filter.unreviewedOnly ? { flaggedForReview: true, reviewedAt: null } : {}),
    ...(filter.query
      ? {
          user: {
            OR: [{ phone: { contains: filter.query } }, { name: { contains: filter.query } }],
          },
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    db.mealPlan.findMany({
      where,
      // Unreviewed flagged plans first: they are the reason this screen exists.
      orderBy: [{ reviewedAt: 'asc' }, { createdAt: 'desc' }],
      skip,
      take,
      select: {
        id: true,
        version: true,
        status: true,
        flaggedForReview: true,
        flagReason: true,
        reviewedAt: true,
        reviewedBy: true,
        aiProvider: true,
        promptVersion: true,
        createdAt: true,
        user: { select: { id: true, name: true, phone: true } },
        subscriptions: { select: { id: true }, take: 1 },
      },
    }),
    db.mealPlan.count({ where }),
  ]);

  return {
    total,
    plans: rows.map((row) => ({
      id: row.id,
      version: row.version,
      status: row.status,
      customerId: row.user.id,
      customerName: row.user.name ?? row.user.phone,
      customerPhone: row.user.phone,
      flaggedForReview: row.flaggedForReview,
      flagReason: row.flagReason,
      reviewedAt: row.reviewedAt,
      reviewedBy: row.reviewedBy,
      aiProvider: row.aiProvider,
      promptVersion: row.promptVersion,
      createdAt: row.createdAt,
      hasSubscription: row.subscriptions.length > 0,
    })),
  };
}

export interface AdminPlanDetail extends AdminPlanRow {
  overallNote: string | null;
  /** The profile as it was when the plan was built (D-107). */
  profileSnapshot: unknown;
  days: Array<{
    dayOfWeek: number;
    items: Array<{
      id: string;
      slot: MealSlot;
      productId: string;
      name: string;
      quantity: number;
      unit: string;
      rationale: string | null;
    }>;
  }>;
}

export async function getMealPlanDetail(
  mealPlanId: string,
  locale: Locale,
): Promise<AdminPlanDetail | null> {
  const plan = await db.mealPlan.findUnique({
    where: { id: mealPlanId },
    select: {
      id: true,
      version: true,
      status: true,
      flaggedForReview: true,
      flagReason: true,
      reviewedAt: true,
      reviewedBy: true,
      aiProvider: true,
      promptVersion: true,
      overallNote: true,
      profileSnapshot: true,
      createdAt: true,
      user: { select: { id: true, name: true, phone: true } },
      subscriptions: { select: { id: true }, take: 1 },
      days: {
        orderBy: { dayOfWeek: 'asc' },
        select: {
          dayOfWeek: true,
          items: {
            orderBy: { sortOrder: 'asc' },
            select: {
              id: true,
              slot: true,
              productId: true,
              quantity: true,
              unit: true,
              rationale: true,
              product: { select: { nameEn: true, nameMr: true, nameHi: true } },
            },
          },
        },
      },
    },
  });

  if (!plan) return null;

  return {
    id: plan.id,
    version: plan.version,
    status: plan.status,
    customerId: plan.user.id,
    customerName: plan.user.name ?? plan.user.phone,
    customerPhone: plan.user.phone,
    flaggedForReview: plan.flaggedForReview,
    flagReason: plan.flagReason,
    reviewedAt: plan.reviewedAt,
    reviewedBy: plan.reviewedBy,
    aiProvider: plan.aiProvider,
    promptVersion: plan.promptVersion,
    createdAt: plan.createdAt,
    hasSubscription: plan.subscriptions.length > 0,
    overallNote: plan.overallNote,
    profileSnapshot: plan.profileSnapshot,
    days: plan.days.map((day) => ({
      dayOfWeek: day.dayOfWeek,
      items: day.items.map((item) => ({
        id: item.id,
        slot: item.slot,
        productId: item.productId,
        name: pickName(item.product, locale),
        quantity: item.quantity,
        unit: item.unit,
        rationale: item.rationale,
      })),
    })),
  };
}

/**
 * B8 — marking a flagged plan reviewed.
 *
 * It does not unflag the plan: the customer keeps their doctor banner, because
 * the condition that raised it has not gone away. It records that a human
 * looked, which is what the queue is counting.
 */
export async function markPlanReviewed(
  mealPlanId: string,
  actorId: string,
  note: string | null,
  ip: string | null,
): Promise<{ ok: boolean; reason?: 'NOT_FOUND' }> {
  const plan = await db.mealPlan.findUnique({
    where: { id: mealPlanId },
    select: { id: true, reviewedAt: true, flagReason: true },
  });
  if (!plan) return { ok: false, reason: 'NOT_FOUND' };

  await db.mealPlan.update({
    where: { id: mealPlanId },
    data: { reviewedBy: actorId, reviewedAt: new Date() },
  });

  await audit({
    actorId,
    action: 'meal_plan.review',
    entityType: 'MealPlan',
    entityId: mealPlanId,
    before: { reviewedAt: plan.reviewedAt },
    after: { reviewedAt: new Date(), note, flagReason: plan.flagReason },
    ip,
  });

  return { ok: true };
}

/**
 * S7 — the manual override. The admin replaces one meal in a plan.
 *
 * The safety filters still apply: the replacement is checked against the
 * customer's declared allergies before it is written. An admin edit is a
 * convenience, not an escape hatch from S4 — nobody should be able to put a
 * peanut into a peanut-allergic customer's plan through a form.
 */
export type ManualEditResult =
  | { ok: true }
  | { ok: false; reason: 'ITEM_NOT_FOUND' | 'PRODUCT_NOT_FOUND' | 'ALLERGEN' };

export async function replacePlanItem(
  mealPlanItemId: string,
  productId: string,
  actorId: string,
  ip: string | null,
): Promise<ManualEditResult> {
  const item = await db.mealPlanItem.findUnique({
    where: { id: mealPlanItemId },
    select: {
      id: true,
      productId: true,
      day: { select: { mealPlan: { select: { userId: true } } } },
    },
  });
  if (!item) return { ok: false, reason: 'ITEM_NOT_FOUND' };

  const [product, profile] = await Promise.all([
    db.product.findUnique({
      where: { id: productId },
      select: {
        id: true,
        nameEn: true,
        nameMr: true,
        nameHi: true,
        tags: true,
        searchKeywords: true,
        unitType: true,
        isActive: true,
        variants: {
          where: { isActive: true },
          orderBy: [{ isDefault: 'desc' }, { quantity: 'asc' }],
          take: 1,
          select: { id: true },
        },
      },
    }),
    db.healthProfile.findUnique({
      where: { userId: item.day.mealPlan.userId },
      select: { allergies: true, householdAdults: true, householdChildren: true },
    }),
  ]);

  if (!product || !product.isActive) return { ok: false, reason: 'PRODUCT_NOT_FOUND' };

  // S4 holds even here.
  const { containsAllergen } = await import('@/lib/meal-plan/allergens');
  const allergies = Array.isArray(profile?.allergies)
    ? profile.allergies.filter((entry): entry is string => typeof entry === 'string')
    : [];

  if (containsAllergen({ ...product, aliases: [] }, allergies)) {
    return { ok: false, reason: 'ALLERGEN' };
  }

  // B4 — the quantity is recomputed, never inherited.
  const quantity = computeQuantity(
    {
      adults: profile?.householdAdults ?? 1,
      children: profile?.householdChildren ?? 0,
    },
    product.unitType as QuantityUnit,
  );

  await db.mealPlanItem.update({
    where: { id: mealPlanItemId },
    data: {
      productId: product.id,
      variantId: product.variants[0]?.id ?? null,
      quantity: quantity.quantity,
      unit: quantity.unit,
      // The old rationale described the old vegetable.
      rationale: null,
    },
  });

  await audit({
    actorId,
    action: 'meal_plan.manual_edit',
    entityType: 'MealPlanItem',
    entityId: mealPlanItemId,
    before: { productId: item.productId },
    after: { productId: product.id },
    ip,
  });

  return { ok: true };
}

/** B6 — the swap log. Visibility without a gate. */
export interface SwapLogRow {
  id: string;
  customerName: string;
  customerPhone: string;
  reasonCode: string;
  reasonText: string | null;
  status: string;
  chosenProductId: string | null;
  createdAt: Date;
  resolvedAt: Date | null;
}

export async function listSwapRequests({
  skip,
  take,
}: {
  skip: number;
  take: number;
}): Promise<{ swaps: SwapLogRow[]; total: number }> {
  const [rows, total] = await Promise.all([
    db.mealPlanSwapRequest.findMany({
      orderBy: { createdAt: 'desc' },
      skip,
      take,
      select: {
        id: true,
        reasonCode: true,
        reasonText: true,
        status: true,
        chosenProductId: true,
        createdAt: true,
        resolvedAt: true,
        user: { select: { name: true, phone: true } },
      },
    }),
    db.mealPlanSwapRequest.count(),
  ]);

  return {
    total,
    swaps: rows.map((row) => ({
      id: row.id,
      customerName: row.user.name ?? row.user.phone,
      customerPhone: row.user.phone,
      reasonCode: row.reasonCode,
      reasonText: row.reasonText,
      status: row.status,
      chosenProductId: row.chosenProductId,
      createdAt: row.createdAt,
      resolvedAt: row.resolvedAt,
    })),
  };
}
