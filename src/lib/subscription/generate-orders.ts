import { pickName } from '@/lib/catalog/text';
import { db } from '@/lib/db';
import { isUniqueViolation } from '@/lib/db-errors';
import { ID_PREFIX, newId, newOrderNumber } from '@/lib/ids';
import { buildCandidates } from '@/lib/meal-plan/candidates';
import { parseDateKey, weekdayNumber } from '@/lib/meal-plan/pricing';
import { TEMPLATE, notifyEvent } from '@/lib/notifications/notify';
import { InsufficientBalanceError, LEDGER_REF, debit } from '@/lib/wallet/ledger';
import type { Locale } from '@/generated/prisma/enums';
import { findSubstitute } from './substitute';
import { generationTargetDate } from './schedule';

/**
 * M6 — the 00:30 IST cron.
 *
 *   "For every ACTIVE subscription, read tomorrow's weekday from the plan
 *    template and generate a MEAL_PLAN_DAILY order. Idempotent via unique
 *    (subscription_id, scheduled_date)."
 *
 * This is the job the whole business rests on. A silent failure here means
 * nobody gets vegetables, and the owner finds out from phone calls at 07:00.
 * So: every subscription is processed independently, one failure never stops
 * the rest, and the result is reported in enough detail for the admin
 * dashboard to alert on it (M6's reliability requirement).
 *
 * R5 — running it twice for the same date must be harmless. The unique
 * constraint on `(subscription_id, scheduled_date)` is the guarantee; the
 * pre-check is only the fast path.
 */

export interface GenerationResult {
  targetDate: string;
  eligible: number;
  created: number;
  skipped: number;
  duplicates: number;
  paymentPending: number;
  substituted: number;
  dropped: number;
  failures: Array<{ subscriptionId: string; message: string }>;
}

export interface GenerateOrdersInput {
  /** Defaults to the IST date the 00:30 run belongs to. */
  targetDate?: string;
  now?: Date;
  locale?: Locale;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

export async function generateDailyOrders(
  input: GenerateOrdersInput = {},
): Promise<GenerationResult> {
  const now = input.now ?? new Date();
  const targetDate = input.targetDate ?? generationTargetDate(now);
  const locale: Locale = input.locale ?? 'mr';

  const scheduledDate = parseDateKey(targetDate);
  const weekday = weekdayNumber(scheduledDate);

  const result: GenerationResult = {
    targetDate,
    eligible: 0,
    created: 0,
    skipped: 0,
    duplicates: 0,
    paymentPending: 0,
    substituted: 0,
    dropped: 0,
    failures: [],
  };

  const subscriptions = await db.subscription.findMany({
    where: {
      status: 'ACTIVE',
      startDate: { lte: scheduledDate },
      endDate: { gte: scheduledDate },
    },
    select: {
      id: true,
      userId: true,
      mealPlanId: true,
      deliverySlot: true,
      address: {
        select: {
          id: true,
          label: true,
          line1: true,
          line2: true,
          landmark: true,
          city: true,
          state: true,
          pincode: true,
          latitude: true,
          longitude: true,
        },
      },
    },
  });

  result.eligible = subscriptions.length;

  for (const subscription of subscriptions) {
    try {
      const outcome = await generateForSubscription({
        subscription,
        scheduledDate,
        targetDate,
        weekday,
        locale,
      });

      switch (outcome.kind) {
        case 'CREATED':
          result.created += 1;
          if (outcome.paymentPending) result.paymentPending += 1;
          result.substituted += outcome.substituted;
          result.dropped += outcome.dropped;
          break;
        case 'DUPLICATE':
          result.duplicates += 1;
          break;
        case 'SKIPPED':
          result.skipped += 1;
          break;
      }
    } catch (error) {
      // One broken subscription must not stop the other two hundred.
      result.failures.push({
        subscriptionId: subscription.id,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return result;
}

type SubscriptionRow = Awaited<ReturnType<typeof db.subscription.findMany>> extends Array<infer T>
  ? T
  : never;

interface PerSubscriptionInput {
  subscription: {
    id: string;
    userId: string;
    mealPlanId: string;
    deliverySlot: string;
    address: {
      id: string;
      label: string;
      line1: string;
      line2: string | null;
      landmark: string | null;
      city: string;
      state: string;
      pincode: string;
      latitude: number | null;
      longitude: number | null;
    };
  };
  scheduledDate: Date;
  targetDate: string;
  weekday: number;
  locale: Locale;
}

type PerSubscriptionOutcome =
  | { kind: 'CREATED'; paymentPending: boolean; substituted: number; dropped: number }
  | { kind: 'DUPLICATE' }
  | { kind: 'SKIPPED'; reason: string };

async function generateForSubscription(
  input: PerSubscriptionInput,
): Promise<PerSubscriptionOutcome> {
  const { subscription, scheduledDate, targetDate, weekday, locale } = input;

  // M6 — a skip or a pause on this date means no order at all.
  const exception = await db.subscriptionException.findUnique({
    where: { subscriptionId_date: { subscriptionId: subscription.id, date: scheduledDate } },
    select: { type: true },
  });
  if (exception) return { kind: 'SKIPPED', reason: exception.type };

  // R5 fast path. The unique constraint below is the real guarantee.
  const existing = await db.order.findFirst({
    where: { subscriptionId: subscription.id, scheduledDate },
    select: { id: true },
  });
  if (existing) return { kind: 'DUPLICATE' };

  const day = await db.mealPlanDay.findUnique({
    where: { mealPlanId_dayOfWeek: { mealPlanId: subscription.mealPlanId, dayOfWeek: weekday } },
    select: {
      items: {
        orderBy: { sortOrder: 'asc' },
        select: {
          slot: true,
          productId: true,
          variantId: true,
          quantity: true,
          product: {
            select: {
              id: true,
              nameEn: true,
              nameMr: true,
              nameHi: true,
              imageUrls: true,
              tags: true,
              category: { select: { slug: true } },
            },
          },
          variant: { select: { id: true, pricePaise: true, stockQty: true, isActive: true } },
        },
      },
    },
  });

  if (!day || day.items.length === 0) return { kind: 'SKIPPED', reason: 'NO_TEMPLATE_DAY' };

  const profile = await db.healthProfile.findUnique({
    where: { userId: subscription.userId },
    select: { allergies: true, dislikedProductIds: true, dietaryPreference: true },
  });

  // B7 — substitutes must pass the same hard filters as generation, so the
  // candidate list is built the same way.
  const { candidates } = await buildCandidates({
    allergies: stringArray(profile?.allergies),
    dislikedProductIds: stringArray(profile?.dislikedProductIds),
    dietaryPreference: profile?.dietaryPreference ?? 'VEG',
    locale,
  });

  interface ResolvedItem {
    slot: 'MORNING' | 'EVENING';
    productId: string;
    variantId: string;
    name: string;
    imageUrl: string | null;
    quantity: number;
    unitPricePaise: bigint;
    isSubstituted: boolean;
    originalProductId: string | null;
  }

  const resolved: ResolvedItem[] = [];
  const substitutions: Array<{ from: string; to: string; slot: string }> = [];
  const dropped: Array<{ name: string; slot: string }> = [];
  const chosenProductIds: string[] = [];

  for (const item of day.items) {
    const inStock =
      item.variant !== null && item.variant.isActive && item.variant.stockQty >= item.quantity;

    if (inStock && item.variant) {
      resolved.push({
        slot: item.slot,
        productId: item.productId,
        variantId: item.variant.id,
        name: pickName(item.product, locale),
        imageUrl: firstImage(item.product.imageUrls),
        quantity: item.quantity,
        unitPricePaise: item.variant.pricePaise,
        isSubstituted: false,
        originalProductId: null,
      });
      chosenProductIds.push(item.productId);
      continue;
    }

    // B7 — out of stock. Substitute automatically; the decision cannot wait for
    // a customer reply at half past midnight.
    const substitute = findSubstitute({
      original: {
        id: item.productId,
        categorySlug: item.product.category.slug,
        tags: Array.isArray(item.product.tags)
          ? item.product.tags.filter((tag): tag is string => typeof tag === 'string')
          : [],
      },
      candidates,
      excludeProductIds: chosenProductIds,
    });

    if (!substitute || !substitute.product.variant) {
      // B7 — "If no acceptable substitute exists, drop the item, do not
      // charge, and notify."
      dropped.push({ name: pickName(item.product, locale), slot: item.slot });
      continue;
    }

    resolved.push({
      slot: item.slot,
      productId: substitute.product.id,
      variantId: substitute.product.variant.id,
      name: substitute.product.name,
      imageUrl: null,
      quantity: item.quantity,
      unitPricePaise: substitute.product.variant.pricePaise,
      isSubstituted: true,
      // B7 — retain what it replaced, so the customer can be told and the
      // admin can see the pattern.
      originalProductId: item.productId,
    });
    chosenProductIds.push(substitute.product.id);
    substitutions.push({
      from: pickName(item.product, locale),
      to: substitute.product.name,
      slot: item.slot,
    });
  }

  if (resolved.length === 0) {
    // Nothing left to deliver. Notify rather than creating an empty order the
    // rider would carry an empty bag for.
    await notifyEvent(subscription.userId, TEMPLATE.orderItemDropped, {
      date: targetDate,
      dropped,
      allDropped: true,
    });
    return { kind: 'SKIPPED', reason: 'NOTHING_IN_STOCK' };
  }

  // B10 — delivery is always free on meal-plan days; the ₹99 plan fee covers
  // it. B7 — the price difference from a substitution settles honestly here,
  // because the order is priced from what is actually being sent.
  const subtotalPaise = resolved.reduce(
    (sum, item) => sum + item.unitPricePaise * BigInt(item.quantity),
    0n,
  );

  const orderId = newId(ID_PREFIX.order);
  let paymentPending = false;

  try {
    await db.$transaction(async (tx) => {
      // Atomic conditional decrement, same pattern as instant orders. Two
      // subscriptions racing for the last kilo: exactly one wins, and the other
      // is handled as out-of-stock on the next run.
      for (const item of resolved) {
        const updated = await tx.productVariant.updateMany({
          where: { id: item.variantId, stockQty: { gte: item.quantity } },
          data: { stockQty: { decrement: item.quantity } },
        });
        if (updated.count === 0) {
          throw new Error(`Stock disappeared for variant ${item.variantId} mid-generation`);
        }
      }

      await tx.order.create({
        data: {
          id: orderId,
          orderNumber: newOrderNumber(scheduledDate),
          userId: subscription.userId,
          addressSnapshot: subscription.address,
          type: 'MEAL_PLAN_DAILY',
          status: 'PLACED',
          subtotalPaise,
          deliveryFeePaise: 0n,
          handlingFeePaise: 0n,
          discountPaise: 0n,
          totalPaise: subtotalPaise,
          // B9 — COD is never offered on a daily plan order.
          paymentMethod: 'WALLET',
          paymentStatus: 'PENDING',
          subscriptionId: subscription.id,
          scheduledDate,
          deliverySlot: 'SUBSCRIPTION_0630_0900',
          // R5 — the natural idempotency key for this job.
          idempotencyKey: `sub:${subscription.id}:${targetDate}`,
          items: {
            create: resolved.map((item) => ({
              id: newId(ID_PREFIX.orderItem),
              productId: item.productId,
              variantId: item.variantId,
              nameSnapshot: item.name,
              imageSnapshot: item.imageUrl,
              // B1 — packing slips group items under सकाळी / संध्याकाळी.
              mealSlot: item.slot,
              quantity: item.quantity,
              unitPricePaise: item.unitPricePaise,
              totalPaise: item.unitPricePaise * BigInt(item.quantity),
              isSubstituted: item.isSubstituted,
              originalProductId: item.originalProductId,
            })),
          },
        },
      });

      await tx.orderStatusHistory.create({
        data: {
          id: newId(ID_PREFIX.orderStatus),
          orderId,
          fromStatus: null,
          toStatus: 'PLACED',
          changedBy: null,
          reason: 'Generated by the daily subscription job',
        },
      });

      // B3 — wallet auto-debit at generation.
      try {
        await debit(
          {
            userId: subscription.userId,
            amountPaise: subtotalPaise,
            source: 'ORDER',
            ...LEDGER_REF.order(orderId),
            note: `Daily delivery ${targetDate}`,
          },
          tx,
        );
        await tx.order.update({ where: { id: orderId }, data: { paymentStatus: 'PAID' } });
      } catch (error) {
        if (!(error instanceof InsufficientBalanceError)) throw error;

        // B3 — "Insufficient at generation → hold order PAYMENT_PENDING,
        // notify, retry 08:00." The order still exists and the stock is still
        // held; the 08:00 job resolves it either way.
        paymentPending = true;
        await tx.order.update({
          where: { id: orderId },
          data: { status: 'PAYMENT_PENDING' },
        });
        await tx.orderStatusHistory.create({
          data: {
            id: newId(ID_PREFIX.orderStatus),
            orderId,
            fromStatus: 'PLACED',
            toStatus: 'PAYMENT_PENDING',
            changedBy: null,
            reason: 'Insufficient wallet balance at generation',
          },
        });
      }
    });
  } catch (error) {
    // R5 — two runs racing each other. The unique constraint caught the loser.
    if (isUniqueViolation(error)) return { kind: 'DUPLICATE' };
    throw error;
  }

  // ── Notifications. Recorded outside the transaction: a failed notification
  // must never roll back the order it was describing.
  if (paymentPending) {
    await notifyEvent(subscription.userId, TEMPLATE.orderPaymentPending, {
      orderId,
      date: targetDate,
      amountPaise: subtotalPaise,
    });
  }

  if (substitutions.length > 0) {
    // B7 — notified with the reason, and a one-tap "हे नको" that adds it to
    // dislikes. The action lives on the order screen; this is the record.
    await notifyEvent(subscription.userId, TEMPLATE.orderSubstituted, {
      orderId,
      date: targetDate,
      substitutions,
    });
  }

  if (dropped.length > 0) {
    await notifyEvent(subscription.userId, TEMPLATE.orderItemDropped, {
      orderId,
      date: targetDate,
      dropped,
      allDropped: false,
    });
  }

  return {
    kind: 'CREATED',
    paymentPending,
    substituted: substitutions.length,
    dropped: dropped.length,
  };
}

function firstImage(imageUrls: unknown): string | null {
  if (!Array.isArray(imageUrls) || imageUrls.length === 0) return null;
  const first = imageUrls[0];
  return typeof first === 'string' && first !== '' ? first : null;
}

export type { SubscriptionRow };
