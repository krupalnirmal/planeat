import { db } from '@/lib/db';
import { pickName } from '@/lib/catalog/text';
import { ID_PREFIX, newId } from '@/lib/ids';
import type { Locale } from '@/generated/prisma/enums';
import { PLAN_CATEGORY_SLUGS, type PlanCategorySlug } from './plan-categories';

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

/** The plan the customer is currently building/has built, if any. */
export async function getCustomerPlan(userId: string, locale: Locale): Promise<CustomerPlanView | null> {
  const plan = await db.mealPlan.findFirst({
    where: { userId, generatedBy: 'CUSTOMER' },
    orderBy: { version: 'desc' },
    select: planSelect,
  });
  if (!plan) return null;

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
 */
export async function saveCustomerPlan(userId: string, inputDays: SaveDayInput[]): Promise<CustomerPlanView> {
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
        await tx.mealPlan.create({
          data: { id: mealPlanId, userId, status: 'ACTIVE', generatedBy: 'CUSTOMER', profileSnapshot: undefined },
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
          name: item.product.nameEn,
          variantLabel: item.variant.label,
          pricePaise: item.variant.pricePaise,
        })),
    })),
  };
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

/** The 4 category columns and their pickable products, in display order. */
export async function getPlanColumns(locale: Locale): Promise<PlanColumn[]> {
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

  return PLAN_CATEGORY_SLUGS.map((slug) => {
    const category = bySlug.get(slug);
    if (!category) return { slug, name: slug, products: [] };

    return {
      slug,
      name: pickName(category, locale),
      products: category.products.map((product) => ({
        id: product.id,
        name: pickName(product, locale),
        variants: product.variants,
      })),
    };
  });
}
