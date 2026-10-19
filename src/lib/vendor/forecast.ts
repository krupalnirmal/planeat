import { db } from '@/lib/db';
import { pickName } from '@/lib/catalog/text';
import { formatQuantity, type QuantityUnit } from '@/lib/quantity';
import { findNearestVendor } from '@/lib/vendor/match';
import type { Locale } from '@/generated/prisma/enums';
import { addDays, isDeliveryDueToday, istDateKeyOf, parseDateKey, weekdayNumber } from '@/lib/subscription/schedule';

/**
 * Vendor order-packing's missing procurement question (session 2026-10-19,
 * client request): "how much of each vegetable do I need to buy for
 * tomorrow?" `src/lib/admin/picklist.ts` already answers this for the
 * owner, but only for orders ALREADY placed today — a meal-plan day's
 * order does not exist yet until the 00:30 cron creates it, so a vendor
 * checking the evening before sees nothing there.
 *
 * This instead forecasts from tomorrow's ACTIVE subscriptions directly —
 * the same `isDeliveryDueToday`/nearest-vendor logic
 * `generateDailyOrders()` itself will run a few hours later, just read-only
 * and a day early. It is an estimate, not a guarantee: an out-of-stock
 * substitution at generation time can change the real order, and this
 * never reflects that (unlike the cron, nothing here is mutated).
 */

export interface VendorRequirementLine {
  productId: string;
  name: string;
  totalQuantity: number;
  unit: QuantityUnit;
  displayQuantity: string;
  /** How many subscriptions contribute to this line — lets the vendor see
      "this is for 6 customers' worth", not just a bare number. */
  subscriptionCount: number;
}

const ITEM_SELECT = {
  orderBy: { sortOrder: 'asc' as const },
  select: {
    productId: true,
    quantity: true,
    product: { select: { nameEn: true, nameMr: true, nameHi: true } },
    variant: { select: { id: true, quantity: true, unit: true } },
  },
};

async function fetchDayItems(mealPlanId: string, deliveryMode: string, weekday: number) {
  if (deliveryMode === 'WEEKLY') {
    const days = await db.mealPlanDay.findMany({
      where: { mealPlanId },
      select: { items: ITEM_SELECT },
    });
    return days.flatMap((d) => d.items);
  }

  const day = await db.mealPlanDay.findUnique({
    where: { mealPlanId_dayOfWeek: { mealPlanId, dayOfWeek: weekday } },
    select: { items: ITEM_SELECT },
  });
  return day?.items ?? [];
}

/** Tomorrow's forecast demand, for the subscriptions this vendor is nearest
    to — grouped by product, summed in each item's own unit (matches
    `buildPicklist`'s own aggregation shape, just forward-looking). */
export async function getTomorrowRequirement(
  vendorId: string,
  now: Date = new Date(),
  locale: Locale | string = 'mr',
): Promise<VendorRequirementLine[]> {
  const tomorrow = addDays(parseDateKey(istDateKeyOf(now)), 1);
  const weekday = weekdayNumber(tomorrow);

  const subscriptions = await db.subscription.findMany({
    where: { status: 'ACTIVE', startDate: { lte: tomorrow }, endDate: { gte: tomorrow } },
    select: {
      id: true,
      mealPlanId: true,
      deliveryMode: true,
      startDate: true,
      address: { select: { latitude: true, longitude: true } },
    },
  });

  const due = subscriptions.filter((sub) => isDeliveryDueToday(sub.deliveryMode, sub.startDate, tomorrow));
  if (due.length === 0) return [];

  // A SKIP/PAUSE already recorded for tomorrow means that subscription's
  // order never generates — same exception check `generateForSubscription`
  // makes, just read-only and a day early.
  const exceptions = await db.subscriptionException.findMany({
    where: { subscriptionId: { in: due.map((sub) => sub.id) }, date: tomorrow },
    select: { subscriptionId: true },
  });
  const excluded = new Set(exceptions.map((row) => row.subscriptionId));
  const active = due.filter((sub) => !excluded.has(sub.id));
  if (active.length === 0) return [];

  // Only the subscriptions THIS vendor would actually pack — same
  // haversine match `generateForSubscription` runs at creation time.
  const mine: typeof active = [];
  for (const sub of active) {
    const nearest = await findNearestVendor(sub.address.latitude, sub.address.longitude);
    if (nearest?.id === vendorId) mine.push(sub);
  }
  if (mine.length === 0) return [];

  const byVariant = new Map<
    string,
    { productId: string; name: string; totalQuantity: number; unit: QuantityUnit; subscriptionIds: Set<string> }
  >();

  for (const sub of mine) {
    const items = await fetchDayItems(sub.mealPlanId, sub.deliveryMode, weekday);

    for (const item of items) {
      if (!item.variant) continue; // Out of stock today — generation would substitute; a forecast can't guess what with.

      const unitQuantity = item.variant.quantity;
      const unit = item.variant.unit as QuantityUnit;
      const total = unitQuantity * item.quantity;

      const existing = byVariant.get(item.variant.id);
      if (existing) {
        existing.totalQuantity += total;
        existing.subscriptionIds.add(sub.id);
      } else {
        byVariant.set(item.variant.id, {
          productId: item.productId,
          name: pickName(item.product, locale),
          totalQuantity: total,
          unit,
          subscriptionIds: new Set([sub.id]),
        });
      }
    }
  }

  return [...byVariant.values()]
    .map((line) => ({
      productId: line.productId,
      name: line.name,
      totalQuantity: line.totalQuantity,
      unit: line.unit,
      displayQuantity: formatQuantity(line.totalQuantity, line.unit),
      subscriptionCount: line.subscriptionIds.size,
    }))
    .sort((a, b) => b.totalQuantity - a.totalQuantity);
}
