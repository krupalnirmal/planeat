import { pickName } from '@/lib/catalog/text';
import { db } from '@/lib/db';
import { ID_PREFIX, newId } from '@/lib/ids';
import { getStorageProvider } from '@/lib/services/storage';
import type { Locale, MealSlot } from '@/generated/prisma/enums';
import { PLAN_CATEGORIES, type PlanCategoryCode } from './plan-categories';

/**
 * The draft lifecycle after generation: reading the current draft for the
 * picker UI, recording the customer's selections, and resolving the
 * approved selections into a real `MealPlan` (`finalizeDraft`).
 *
 * Deliberately separate from `generate-options.ts` (which only produces the
 * draft) and from `generate.ts`/`swap.ts` (the single-pick pipeline's own
 * persistence, untouched by this file).
 */

// ─────────────────────────────────────────────────────────────
// Read
// ─────────────────────────────────────────────────────────────

export interface DraftOptionView {
  id: string;
  productId: string;
  variantId: string | null;
  name: string;
  imageUrl: string | null;
  pricePaise: string | null;
  mrpPaise: string | null;
  suggestedQuantity: number | null;
  quantityUnit: string | null;
  inStock: boolean;
  selected: boolean;
  chosenQuantity: number | null;
}

export interface DraftCategoryView {
  id: string;
  category: PlanCategoryCode;
  selectionType: 'SINGLE' | 'MULTIPLE';
  options: DraftOptionView[];
}

export interface DraftDayView {
  dayNumber: number;
  categories: DraftCategoryView[];
}

export interface DraftView {
  id: string;
  status: string;
  planType: string;
  flaggedForReview: boolean;
  days: DraftDayView[];
}

function imageUrlOf(imageUrls: unknown): string | null {
  if (!Array.isArray(imageUrls) || imageUrls.length === 0) return null;
  const first = imageUrls[0];
  if (typeof first !== 'string' || first === '') return null;
  if (first.startsWith('http') || first.startsWith('/')) return first;
  return getStorageProvider().urlFor(first, { width: 300, auto: true });
}

const draftSelect = {
  id: true,
  userId: true,
  status: true,
  planType: true,
  flaggedForReview: true,
  days: {
    orderBy: { dayNumber: 'asc' as const },
    select: {
      dayNumber: true,
      categories: {
        select: {
          id: true,
          category: true,
          selectionType: true,
          options: {
            orderBy: { sortOrder: 'asc' as const },
            select: {
              id: true,
              productId: true,
              variantId: true,
              selected: true,
              chosenQuantity: true,
              suggestedQuantity: true,
              quantityUnit: true,
              product: { select: { nameEn: true, nameMr: true, nameHi: true, imageUrls: true } },
              variant: { select: { pricePaise: true, mrpPaise: true, stockQty: true } },
            },
          },
        },
      },
    },
  },
} as const;

type DraftRow = NonNullable<Awaited<ReturnType<typeof loadDraft>>>;

function loadDraft(where: { id: string } | { userId: string }) {
  return 'id' in where
    ? db.mealPlanDraft.findUnique({ where: { id: where.id }, select: draftSelect })
    : db.mealPlanDraft.findFirst({
        where: { userId: where.userId },
        orderBy: { createdAt: 'desc' },
        select: draftSelect,
      });
}

function toView(draft: DraftRow, locale: Locale): DraftView {
  return {
    id: draft.id,
    status: draft.status,
    planType: draft.planType,
    flaggedForReview: draft.flaggedForReview,
    days: draft.days.map((day) => ({
      dayNumber: day.dayNumber,
      categories: day.categories.map((cat) => ({
        id: cat.id,
        category: cat.category as PlanCategoryCode,
        selectionType: cat.selectionType,
        options: cat.options.map((option) => ({
          id: option.id,
          productId: option.productId,
          variantId: option.variantId,
          name: pickName(option.product, locale),
          imageUrl: imageUrlOf(option.product.imageUrls),
          pricePaise: option.variant?.pricePaise?.toString() ?? null,
          mrpPaise: option.variant?.mrpPaise?.toString() ?? null,
          suggestedQuantity: option.suggestedQuantity,
          quantityUnit: option.quantityUnit,
          inStock: (option.variant?.stockQty ?? 0) > 0,
          selected: option.selected,
          chosenQuantity: option.chosenQuantity,
        })),
      })),
    })),
  };
}

/** GET .../draft/current — the newest draft, whatever its status. */
export async function getCurrentDraft(userId: string, locale: Locale): Promise<DraftView | null> {
  const draft = await loadDraft({ userId });
  return draft ? toView(draft, locale) : null;
}

async function getOwnedDraft(userId: string, draftId: string): Promise<DraftRow | null> {
  const draft = await loadDraft({ id: draftId });
  if (!draft || draft.userId !== userId) return null;
  return draft;
}

// ─────────────────────────────────────────────────────────────
// Select
// ─────────────────────────────────────────────────────────────

export type SelectOptionResult = { ok: true; draft: DraftView } | { ok: false; reason: 'NOT_FOUND' };

export interface SelectOptionInput {
  userId: string;
  draftId: string;
  optionId: string;
  selected: boolean;
  chosenQuantity?: number | null;
  locale: Locale;
}

/**
 * Toggles one option. SINGLE categories clear every sibling in the same
 * category first — the same mutual-exclusivity rule already built for
 * category-row variant chips this session (D-210): a category's selection
 * is one deliberate choice, not an accumulation of taps.
 */
export async function selectDraftOption(input: SelectOptionInput): Promise<SelectOptionResult> {
  // A narrow lookup for the one option being toggled — not the whole
  // draft tree (~150 rows). The remote DB's per-round-trip latency makes
  // that difference the whole point: this used to load the full draft
  // twice (once to find the option, once to return the refreshed view)
  // and took 7-10s per tap in practice.
  const option = await db.mealPlanDraftOption.findUnique({
    where: { id: input.optionId },
    select: {
      id: true,
      suggestedQuantity: true,
      category: {
        select: {
          id: true,
          selectionType: true,
          day: { select: { draft: { select: { id: true, userId: true, status: true } } } },
        },
      },
    },
  });

  if (
    !option ||
    option.category.day.draft.id !== input.draftId ||
    option.category.day.draft.userId !== input.userId
  ) {
    return { ok: false, reason: 'NOT_FOUND' };
  }

  const chosenQuantity = input.selected
    ? (input.chosenQuantity ?? option.suggestedQuantity ?? null)
    : null;

  await db.$transaction(async (tx) => {
    if (input.selected && option.category.selectionType === 'SINGLE') {
      await tx.mealPlanDraftOption.updateMany({
        where: { categoryId: option.category.id, NOT: { id: option.id } },
        data: { selected: false, chosenQuantity: null },
      });
    }

    await tx.mealPlanDraftOption.update({
      where: { id: option.id },
      data: { selected: input.selected, chosenQuantity },
    });

    if (option.category.day.draft.status === 'GENERATED') {
      await tx.mealPlanDraft.update({
        where: { id: option.category.day.draft.id },
        data: { status: 'SELECTING' },
      });
    }
  });

  const refreshed = await getOwnedDraft(input.userId, input.draftId);
  return { ok: true, draft: toView(refreshed!, input.locale) };
}

// ─────────────────────────────────────────────────────────────
// Finalize — resolves selections into a real MealPlan
// ─────────────────────────────────────────────────────────────

/**
 * Doc §14 — the customer's plan is one daily delivery, not a two-slot one;
 * this mapping is the only place that decision lives. Breakfast/Dairy/Fruits
 * arrive with the morning drop, Vegetables/Other with the evening one.
 */
const CATEGORY_SLOT: Record<PlanCategoryCode, MealSlot> = {
  BREAKFAST: 'MORNING',
  DAIRY: 'MORNING',
  FRUITS: 'MORNING',
  OTHER: 'EVENING',
  VEGETABLES: 'EVENING',
};

export type FinalizeResult =
  | { ok: true; mealPlanId: string }
  | { ok: false; reason: 'NOT_FOUND' | 'INCOMPLETE'; missing?: string[] };

export async function finalizeDraft(userId: string, draftId: string): Promise<FinalizeResult> {
  const draft = await getOwnedDraft(userId, draftId);
  if (!draft) return { ok: false, reason: 'NOT_FOUND' };

  const missing: string[] = [];
  for (const day of draft.days) {
    for (const cat of day.categories) {
      const selectedCount = cat.options.filter((o) => o.selected).length;
      const ok = cat.selectionType === 'SINGLE' ? selectedCount === 1 : selectedCount >= 1;
      if (!ok) missing.push(`Day ${day.dayNumber} — ${cat.category}`);
    }
  }
  if (missing.length > 0) return { ok: false, reason: 'INCOMPLETE', missing };

  const mealPlanId = newId(ID_PREFIX.mealPlan);

  await db.$transaction(async (tx) => {
    const previous = await tx.mealPlan.findFirst({
      where: { userId },
      orderBy: { version: 'desc' },
      select: { version: true },
    });
    const version = (previous?.version ?? 0) + 1;

    await tx.mealPlan.updateMany({
      where: { userId, status: { in: ['DRAFT', 'PENDING_CUSTOMER'] } },
      data: { status: 'SUPERSEDED' },
    });

    await tx.mealPlan.create({
      data: {
        id: mealPlanId,
        userId,
        version,
        profileSnapshot: { source: 'MAKE_MY_MEAL_PLAN', draftId: draft.id, planType: draft.planType },
        status: 'PENDING_CUSTOMER',
        generatedBy: 'AI',
        promptVersion: 'meal-plan-options.v1',
        flaggedForReview: draft.flaggedForReview,
      },
    });

    for (const day of draft.days) {
      const dayId = newId(ID_PREFIX.mealPlanDay);
      await tx.mealPlanDay.create({
        data: { id: dayId, mealPlanId, dayOfWeek: day.dayNumber },
      });

      let sortOrder = 0;
      for (const cat of day.categories) {
        const category = cat.category as PlanCategoryCode;
        const selected = cat.options.filter((o) => o.selected);

        for (const option of selected) {
          await tx.mealPlanItem.create({
            data: {
              id: newId(ID_PREFIX.mealPlanItem),
              mealPlanDayId: dayId,
              slot: CATEGORY_SLOT[category],
              productId: option.productId,
              variantId: option.variantId,
              quantity: option.chosenQuantity ?? option.suggestedQuantity ?? 1,
              unit: (option.quantityUnit as never) ?? 'G',
              rationale: null,
              sortOrder: sortOrder++,
            },
          });
        }
      }
    }

    await tx.mealPlanDraft.update({
      where: { id: draft.id },
      data: { status: 'APPROVED', resolvedMealPlanId: mealPlanId },
    });
  });

  return { ok: true, mealPlanId };
}

export { PLAN_CATEGORIES };
