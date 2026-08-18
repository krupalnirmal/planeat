import { pickName } from '@/lib/catalog/text';
import { db } from '@/lib/db';
import { ID_PREFIX, newId } from '@/lib/ids';
import { getStorageProvider } from '@/lib/services/storage';
import type { Locale, MealPlanStatus, MealSlot, UnitType } from '@/generated/prisma/enums';

/**
 * Reads for the health profile and the meal plan (M5).
 *
 * S6 — "Health profile access restricted to the customer and Super Admin,
 * every admin view logged." That is enforced here rather than in the route, so
 * no future caller can read a profile without going past the log.
 */

// ─────────────────────────────────────────────────────────────
// Health profile
// ─────────────────────────────────────────────────────────────

export interface HealthProfileView {
  planType: string;
  familyPreferences: Record<string, unknown> | null;
  age: number | null;
  heightCm: number | null;
  weightKg: number | null;
  gender: string | null;
  activityLevel: string | null;
  householdAdults: number;
  householdChildren: number;
  medicalConditions: string[];
  medications: string | null;
  allergies: string[];
  dietaryPreference: string;
  likedProductIds: string[];
  dislikedProductIds: string[];
  goal: string;
  notes: string | null;
  consentGivenAt: Date | null;
  consentVersion: string | null;
  updatedAt: Date;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

export async function getOwnHealthProfile(userId: string): Promise<HealthProfileView | null> {
  const profile = await db.healthProfile.findUnique({ where: { userId } });
  if (!profile) return null;

  return {
    planType: profile.planType,
    familyPreferences: (profile.familyPreferences as Record<string, unknown> | null) ?? null,
    age: profile.age,
    heightCm: profile.heightCm,
    weightKg: profile.weightKg,
    gender: profile.gender,
    activityLevel: profile.activityLevel,
    householdAdults: profile.householdAdults,
    householdChildren: profile.householdChildren,
    medicalConditions: stringArray(profile.medicalConditions),
    medications: profile.medications,
    allergies: stringArray(profile.allergies),
    dietaryPreference: profile.dietaryPreference,
    likedProductIds: stringArray(profile.likedProductIds),
    dislikedProductIds: stringArray(profile.dislikedProductIds),
    goal: profile.goal,
    notes: profile.notes,
    consentGivenAt: profile.consentGivenAt,
    consentVersion: profile.consentVersion,
    updatedAt: profile.updatedAt,
  };
}

/**
 * S6 — an admin reading someone else's health profile is logged, always.
 *
 * The log row is written BEFORE the profile is returned. If the write fails,
 * the read fails: an unlogged access is not an acceptable outcome for the one
 * category of data the DPDP Act treats as sensitive.
 */
export async function getHealthProfileAsAdmin(
  targetUserId: string,
  actorId: string,
  reason: string | null,
  ip: string | null,
): Promise<HealthProfileView | null> {
  const profile = await db.healthProfile.findUnique({
    where: { userId: targetUserId },
    select: { id: true },
  });

  if (!profile) return null;

  await db.healthProfileAccessLog.create({
    data: {
      id: newId(ID_PREFIX.healthAccess),
      healthProfileId: profile.id,
      actorId,
      reason,
      ip,
    },
  });

  return getOwnHealthProfile(targetUserId);
}

// ─────────────────────────────────────────────────────────────
// Meal plan
// ─────────────────────────────────────────────────────────────

export interface MealPlanItemView {
  id: string;
  slot: MealSlot;
  productId: string;
  variantId: string | null;
  name: string;
  imageUrl: string | null;
  quantity: number;
  unit: UnitType;
  rationale: string | null;
  pricePaise: bigint | null;
  inStock: boolean;
}

export interface MealPlanDayView {
  dayOfWeek: number;
  items: MealPlanItemView[];
}

export interface MealPlanView {
  id: string;
  version: number;
  status: MealPlanStatus;
  generatedBy: string;
  aiProvider: string | null;
  aiModel: string | null;
  promptVersion: string | null;
  overallNote: string | null;
  flaggedForReview: boolean;
  /** Never sent to the customer — the admin queue reads it (B8). */
  flagReason: string | null;
  approvedAt: Date | null;
  createdAt: Date;
  days: MealPlanDayView[];
  /** B2 — the approval screen needs this; P5 turns it into a period total. */
  estimatedDailyCostPaise: bigint;
}

function imageUrlOf(imageUrls: unknown): string | null {
  if (!Array.isArray(imageUrls) || imageUrls.length === 0) return null;
  const first = imageUrls[0];
  if (typeof first !== 'string' || first === '') return null;
  if (first.startsWith('http') || first.startsWith('/')) return first;
  return getStorageProvider().urlFor(first, { width: 300, auto: true });
}

/** One query. Days, items, products and variants all come back together. */
async function loadPlan(where: { id: string } | { userId: string }) {
  const plan =
    'id' in where
      ? await db.mealPlan.findUnique({ where: { id: where.id }, select: planSelect })
      : await db.mealPlan.findFirst({
          where: {
            userId: where.userId,
            status: { in: ['PENDING_CUSTOMER', 'ACTIVE'] },
          },
          orderBy: [{ status: 'asc' }, { version: 'desc' }],
          select: planSelect,
        });

  return plan;
}

const planSelect = {
  id: true,
  userId: true,
  version: true,
  status: true,
  generatedBy: true,
  aiProvider: true,
  aiModel: true,
  promptVersion: true,
  overallNote: true,
  flaggedForReview: true,
  flagReason: true,
  approvedAt: true,
  createdAt: true,
  days: {
    orderBy: { dayOfWeek: 'asc' as const },
    select: {
      dayOfWeek: true,
      items: {
        orderBy: { sortOrder: 'asc' as const },
        select: {
          id: true,
          slot: true,
          productId: true,
          variantId: true,
          quantity: true,
          unit: true,
          rationale: true,
          product: {
            select: { nameEn: true, nameMr: true, nameHi: true, imageUrls: true },
          },
          variant: { select: { pricePaise: true, stockQty: true } },
        },
      },
    },
  },
} as const;

type PlanRow = NonNullable<Awaited<ReturnType<typeof loadPlan>>>;

function toView(plan: PlanRow, locale: Locale, includeFlagReason: boolean): MealPlanView {
  let estimatedDailyCostPaise = 0n;

  const days: MealPlanDayView[] = plan.days.map((day) => ({
    dayOfWeek: day.dayOfWeek,
    items: day.items.map((item) => {
      const price = item.variant?.pricePaise ?? null;
      if (price !== null) estimatedDailyCostPaise += price;

      return {
        id: item.id,
        slot: item.slot,
        productId: item.productId,
        variantId: item.variantId,
        name: pickName(item.product, locale),
        imageUrl: imageUrlOf(item.product.imageUrls),
        quantity: item.quantity,
        unit: item.unit,
        rationale: item.rationale,
        pricePaise: price,
        inStock: (item.variant?.stockQty ?? 0) > 0,
      };
    }),
  }));

  // The plan is a weekly template, so the daily estimate is the week's cost
  // spread over seven days (B2: "estimated daily cost").
  const dailyAverage = days.length > 0 ? estimatedDailyCostPaise / BigInt(days.length) : 0n;

  return {
    id: plan.id,
    version: plan.version,
    status: plan.status,
    generatedBy: plan.generatedBy,
    aiProvider: plan.aiProvider,
    aiModel: plan.aiModel,
    promptVersion: plan.promptVersion,
    overallNote: plan.overallNote,
    flaggedForReview: plan.flaggedForReview,
    flagReason: includeFlagReason ? plan.flagReason : null,
    approvedAt: plan.approvedAt,
    createdAt: plan.createdAt,
    days,
    estimatedDailyCostPaise: dailyAverage,
  };
}

/** The plan the customer is currently looking at, if any. */
export async function getCurrentMealPlan(
  userId: string,
  locale: Locale,
): Promise<MealPlanView | null> {
  const plan = await loadPlan({ userId });
  if (!plan) return null;
  return toView(plan, locale, false);
}

/** R9 — ownership is checked here, not by trusting the id in the URL. */
export async function getMealPlanForUser(
  mealPlanId: string,
  userId: string,
  locale: Locale,
): Promise<MealPlanView | null> {
  const plan = await loadPlan({ id: mealPlanId });
  if (!plan || plan.userId !== userId) return null;
  return toView(plan, locale, false);
}
