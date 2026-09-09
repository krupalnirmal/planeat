import { db } from '@/lib/db';
import { pickName } from '@/lib/catalog/text';
import { ID_PREFIX, newId } from '@/lib/ids';
import type { Locale } from '@/generated/prisma/enums';
import { DAILY_ESSENTIAL_VEGETABLE_SKUS, PLAN_CATEGORY_SLUGS, SPROUT_SKUS, type PlanCategorySlug } from './plan-categories';

/**
 * Reads and writes for the manual weekly plan picker (session 2026-08-30).
 *
 * One evolving plan per customer (`{ userId, version: 1 }`, never
 * versioned up) — a save replaces the whole week's picks rather than
 * building a new plan alongside the old one. `MealPlan`/`MealPlanDay`/
 * `MealPlanItem` are the same tables the (now-removed) AI generator used to
 * write and the subscription cron still reads for anyone on an active
 * subscription — nothing here changes that read path, it just changes who
 * fills the tables in and how.
 */

export interface PlanItemView {
  productId: string;
  variantId: string;
  name: string;
  variantLabel: string;
  pricePaise: bigint;
}

export interface PlanDayView {
  dayOfWeek: number; // 1 = Monday … 7 = Sunday
  items: PlanItemView[];
}

export interface CustomerPlanView {
  id: string;
  days: PlanDayView[];
}

const planSelect = {
  id: true,
  days: {
    orderBy: { dayOfWeek: 'asc' as const },
    select: {
      dayOfWeek: true,
      items: {
        orderBy: { sortOrder: 'asc' as const },
        select: {
          productId: true,
          variantId: true,
          product: { select: { nameEn: true, nameMr: true, nameHi: true } },
          variant: { select: { label: true, pricePaise: true } },
        },
      },
    },
  },
} as const;

type RawPlan = NonNullable<Awaited<ReturnType<typeof db.mealPlan.findFirst<{ select: typeof planSelect }>>>>;

/** Shared by `getCustomerPlan` and `saveCustomerPlan` — one place that
    resolves locale-appropriate names, rather than `saveCustomerPlan`
    hand-rolling its own (unlocalized) copy. */
function shapePlan(plan: RawPlan, locale: Locale): CustomerPlanView {
  return {
    id: plan.id,
    days: plan.days.map((day) => ({
      dayOfWeek: day.dayOfWeek,
      items: day.items
        .filter((item): item is typeof item & { variantId: string; variant: NonNullable<typeof item.variant> } =>
          item.variantId !== null && item.variant !== null,
        )
        .map((item) => ({
          productId: item.productId,
          variantId: item.variantId,
          name: pickName(item.product, locale),
          variantLabel: item.variant.label,
          pricePaise: item.variant.pricePaise,
        })),
    })),
  };
}

/** The plan the customer is currently building/has built, if any. */
export async function getCustomerPlan(userId: string, locale: Locale): Promise<CustomerPlanView | null> {
  const plan = await db.mealPlan.findFirst({
    where: { userId, generatedBy: 'CUSTOMER' },
    orderBy: { version: 'desc' },
    select: planSelect,
  });
  if (!plan) return null;

  return shapePlan(plan, locale);
}

export interface PlanDayCost {
  dayOfWeek: number;
  /** Sum of that day's picked variants at today's catalogue price — the
      exact shape `src/lib/meal-plan/pricing.ts`'s `estimatePeriodCost`/
      `averageDailyCost` take. Each picked item's `pricePaise` is already
      the price for that specific variant size (e.g. "Onion 250g" = ₹18),
      not a per-unit price needing a separate quantity multiplier — the
      manual picker's `MealPlanItem.quantity` stores the variant's own
      weight, not an order count (see `saveCustomerPlan` below). */
  costPaise: bigint;
}

/** Turns a saved plan into the `PlanDayCost[]` shape the subscribe flow's
    pricing math (`estimatePeriodCost`, `averageDailyCost`) consumes. */
export async function getPlanDayCosts(mealPlanId: string): Promise<PlanDayCost[]> {
  const days = await db.mealPlanDay.findMany({
    where: { mealPlanId },
    select: {
      dayOfWeek: true,
      items: { select: { variant: { select: { pricePaise: true } } } },
    },
  });

  return days.map((day) => ({
    dayOfWeek: day.dayOfWeek,
    costPaise: day.items.reduce((sum, item) => sum + (item.variant?.pricePaise ?? 0n), 0n),
  }));
}

export interface SaveDayInput {
  dayOfWeek: number;
  variantIds: string[];
}

/**
 * Replaces the customer's whole week in one transaction: delete every
 * existing day/item for their plan (both relations are `onDelete: NoAction`
 * — TiDB won't cascade this for us), then recreate all 7 days from what was
 * submitted. A plan with nothing picked yet is created empty rather than
 * deferred, so `getCustomerPlan` always has a stable id to hand back to the
 * client after the first save.
 *
 * Each variant is re-resolved from the database, never trusted from the
 * request body — matches this codebase's standing rule that price/quantity
 * are server-computed. A variant that is inactive, whose product is not
 * `isMealPlanEligible`, or whose category isn't one of the 4 plan columns is
 * silently dropped rather than failing the whole save: the customer's other
 * picks that day should not be lost because one product went out of stock
 * between page-load and save.
 *
 * "Daily Use Vegetables" (session 2026-09-06) is a curated subset of the
 * Vegetables category pulled into its own column (`getPlanColumns` below)
 * so it's never pickable in two places at once — but the pick itself is a
 * per-day choice exactly like every other column, not special-cased here.
 */
export async function saveCustomerPlan(
  userId: string,
  inputDays: SaveDayInput[],
  locale: Locale = 'en',
): Promise<CustomerPlanView> {
  const allVariantIds = [...new Set(inputDays.flatMap((day) => day.variantIds))];

  const validVariants = await db.productVariant.findMany({
    where: {
      id: { in: allVariantIds },
      isActive: true,
      product: {
        isActive: true,
        isMealPlanEligible: true,
        category: { slug: { in: [...PLAN_CATEGORY_SLUGS] }, isActive: true },
      },
    },
    select: { id: true, quantity: true, unit: true, productId: true },
  });
  const validById = new Map(validVariants.map((v) => [v.id, v]));

  // Every id is generated up front in JS (this codebase's ids are
  // client-generated CUIDs, not DB auto-increments — see src/lib/ids.ts), so
  // the whole week's days and items can go in with 2 `createMany` calls
  // instead of one round trip per row. Sequential per-row `create`s here
  // used to blow the interactive-transaction timeout against the remote
  // TiDB connection once a plan had picks on more than a couple of days.
  const dayRecords = inputDays.map((day) => ({ id: newId(ID_PREFIX.mealPlanDay), dayOfWeek: day.dayOfWeek }));

  const itemRecords: Array<{
    id: string;
    mealPlanDayId: string;
    slot: 'MORNING';
    productId: string;
    variantId: string;
    quantity: number;
    unit: (typeof validVariants)[number]['unit'];
    sortOrder: number;
  }> = [];

  inputDays.forEach((day, i) => {
    let sortOrder = 0;
    for (const variantId of new Set(day.variantIds)) {
      const variant = validById.get(variantId);
      if (!variant) continue; // Dropped: inactive, ineligible, or wrong category.

      itemRecords.push({
        id: newId(ID_PREFIX.mealPlanItem),
        mealPlanDayId: dayRecords[i].id,
        slot: 'MORNING', // No AM/PM distinction in the manual picker.
        productId: variant.productId,
        variantId: variant.id,
        quantity: variant.quantity,
        unit: variant.unit,
        sortOrder: sortOrder++,
      });
    }
  });

  const plan = await db.$transaction(
    async (tx) => {
      const existing = await tx.mealPlan.findFirst({
        where: { userId, generatedBy: 'CUSTOMER' },
        select: { id: true, days: { select: { id: true } } },
      });

      const mealPlanId = existing?.id ?? newId(ID_PREFIX.mealPlan);

      if (existing) {
        const dayIds = existing.days.map((d) => d.id);
        if (dayIds.length > 0) {
          await tx.mealPlanItem.deleteMany({ where: { mealPlanDayId: { in: dayIds } } });
          await tx.mealPlanDay.deleteMany({ where: { id: { in: dayIds } } });
        }
      } else {
        // `@@unique([userId, version])` is scoped to the user, not to
        // generatedBy — leaving `version` at its schema default (1) collided
        // with anyone who has an old AI-generated plan sitting at version 1
        // from before this feature was rebuilt as a manual picker (session
        // 2026-08-30). That's every customer who ever touched the old
        // AI flow: their very first save here threw an unhandled unique-
        // constraint error ("Something went wrong", session 2026-09-06).
        // Next version above whatever this user already has, AI or not.
        const highest = await tx.mealPlan.findFirst({
          where: { userId },
          orderBy: { version: 'desc' },
          select: { version: true },
        });
        await tx.mealPlan.create({
          data: {
            id: mealPlanId,
            userId,
            version: (highest?.version ?? 0) + 1,
            status: 'ACTIVE',
            generatedBy: 'CUSTOMER',
            profileSnapshot: undefined,
          },
        });
      }

      await tx.mealPlanDay.createMany({
        data: dayRecords.map((d) => ({ ...d, mealPlanId })),
      });
      if (itemRecords.length > 0) {
        await tx.mealPlanItem.createMany({ data: itemRecords });
      }

      return tx.mealPlan.findUniqueOrThrow({ where: { id: mealPlanId }, select: planSelect });
    },
    { timeout: 15_000 },
  );

  return shapePlan(plan, locale);
}

export interface PlanColumnProduct {
  id: string;
  name: string;
  variants: Array<{ id: string; label: string; pricePaise: bigint }>;
}

export interface PlanColumn {
  slug: PlanCategorySlug;
  name: string;
  products: PlanColumnProduct[];
}

export interface PlanColumnsView {
  columns: PlanColumn[];
  /** "Daily Use Vegetables" — pulled out of the Vegetables column entirely
      (not duplicated), so the same product is never pickable in two places
      at once. Empty if none of the curated SKUs currently exist/are active. */
  dailyEssentials: PlanColumnProduct[];
  /** "Sprouts" — same treatment as `dailyEssentials`. Empty until real
      products exist for the curated SKU list (SPROUT_SKUS). */
  sprouts: PlanColumnProduct[];
}

/** The 4 category columns and their pickable products, in display order,
    plus the always-visible "Daily Use Vegetables" and "Sprouts" sets. */
export async function getPlanColumns(locale: Locale): Promise<PlanColumnsView> {
  const categories = await db.category.findMany({
    where: { slug: { in: [...PLAN_CATEGORY_SLUGS] }, isActive: true },
    select: {
      slug: true,
      nameEn: true,
      nameMr: true,
      nameHi: true,
      products: {
        where: { isActive: true, isMealPlanEligible: true, variants: { some: { isActive: true, stockQty: { gt: 0 } } } },
        orderBy: [{ sortOrder: 'asc' }, { nameEn: 'asc' }],
        select: {
          id: true,
          sku: true,
          nameEn: true,
          nameMr: true,
          nameHi: true,
          variants: {
            where: { isActive: true, stockQty: { gt: 0 } },
            orderBy: [{ isDefault: 'desc' }, { quantity: 'asc' }],
            select: { id: true, label: true, pricePaise: true },
          },
        },
      },
    },
  });

  const bySlug = new Map(categories.map((c) => [c.slug, c]));

  // Two curated subsets of Vegetables get pulled into their own columns
  // (session 2026-09-06) rather than duplicated, so the same product is
  // never pickable in two places at once.
  const curatedLists: Array<{ skus: readonly string[]; bySku: Map<string, PlanColumnProduct> }> = [
    { skus: DAILY_ESSENTIAL_VEGETABLE_SKUS, bySku: new Map() },
    { skus: SPROUT_SKUS, bySku: new Map() },
  ];

  const columns = PLAN_CATEGORY_SLUGS.map((slug) => {
    const category = bySlug.get(slug);
    if (!category) return { slug, name: slug, products: [] };

    const products = category.products
      .filter((product) => {
        if (slug !== 'vegetables') return true;
        const curated = curatedLists.find((list) => list.skus.includes(product.sku));
        if (!curated) return true;
        curated.bySku.set(product.sku, { id: product.id, name: pickName(product, locale), variants: product.variants });
        return false;
      })
      .map((product) => ({
        id: product.id,
        name: pickName(product, locale),
        variants: product.variants,
      }));

    return { slug, name: pickName(category, locale), products };
  });

  // Display order follows each curated list's own ordering, not whatever
  // order the query happened to return them in.
  const [dailyEssentials, sprouts] = curatedLists.map(({ skus, bySku }) =>
    skus.map((sku) => bySku.get(sku)).filter((product): product is PlanColumnProduct => product !== undefined),
  );

  return { columns, dailyEssentials, sprouts };
}
