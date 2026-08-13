import { db } from '@/lib/db';
import { parseDateKey, toDateKey } from '@/lib/meal-plan/pricing';
import { formatQuantity, type QuantityUnit } from '@/lib/quantity';
import { istDateKeyOf } from '@/lib/subscription/schedule';
import type { MealSlot } from '@/generated/prisma/enums';

/**
 * M9's starred screen:
 *
 *   "Daily Picklist ⭐ — Aggregated 'Tomorrow — 12 kg Spinach, 8 kg Tomato…'
 *    plus per-customer packing slips. Printable + CSV.
 *    **Highest-value screen — this replaces the owner's notebook.**"
 *
 * Two views of the same orders, and they are used at different moments:
 *
 *   AGGREGATE — what to buy at the mandi at 05:00. One line per variant, with
 *   the total weight. This is the list the owner carries.
 *
 *   PACKING SLIPS — what goes in each bag afterwards. One per customer, with
 *   items grouped under सकाळी / संध्याकाळी headers (B1), so the customer knows
 *   what to cook when.
 *
 * Getting this wrong means either buying the wrong quantity or packing the
 * wrong bag, and both are discovered at 07:00 with a rider waiting.
 */

export interface PicklistLine {
  productId: string;
  variantId: string;
  name: string;
  /** Summed in the variant's own unit, so 4 × 500 g reads as 2 kg. */
  totalQuantity: number;
  unit: QuantityUnit;
  /** How many bags this line is spread across. */
  orderCount: number;
  displayQuantity: string;
  /** Live stock, so the owner knows what is already in the shop. */
  stockQty: number;
  shortfall: number;
}

export interface PackingSlipItem {
  name: string;
  quantity: number;
  unit: QuantityUnit;
  displayQuantity: string;
  slot: MealSlot | null;
  isSubstituted: boolean;
  originalName: string | null;
}

export interface PackingSlip {
  orderId: string;
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  address: string;
  landmark: string | null;
  deliverySlot: string | null;
  riderName: string | null;
  /** B1 — grouped so the customer knows what to cook when. */
  morning: PackingSlipItem[];
  evening: PackingSlipItem[];
  /** Instant orders have no meal slot. */
  unslotted: PackingSlipItem[];
  totalPaise: bigint;
  paymentMethod: string;
  paymentStatus: string;
  notes: string | null;
}

export interface Picklist {
  dateKey: string;
  orderCount: number;
  lines: PicklistLine[];
  slips: PackingSlip[];
  /** Lines the shop cannot currently cover — the reason to leave early. */
  shortfallCount: number;
}

/**
 * The statuses worth picking for. A cancelled order is not packed, and one
 * still PAYMENT_PENDING might yet be paid at 08:00 — so it IS included, with
 * its payment status on the slip. Leaving it out would mean re-doing the
 * picklist after the retry job runs.
 */
const PICKABLE_STATUSES = ['PLACED', 'CONFIRMED', 'PACKED', 'PAYMENT_PENDING'] as const;

export async function buildPicklist(
  dateKey: string,
  locale: string,
): Promise<Picklist> {
  const scheduledDate = parseDateKey(dateKey);

  const orders = await db.order.findMany({
    where: {
      status: { in: [...PICKABLE_STATUSES] },
      OR: [
        { scheduledDate },
        // Instant orders placed for the same day are packed alongside the
        // subscription bags — the owner does one round, not two.
        {
          type: 'INSTANT',
          scheduledDate: null,
          placedAt: {
            gte: new Date(`${dateKey}T00:00:00.000Z`),
            lt: new Date(`${dateKey}T23:59:59.999Z`),
          },
        },
      ],
    },
    orderBy: { placedAt: 'asc' },
    select: {
      id: true,
      orderNumber: true,
      addressSnapshot: true,
      deliverySlot: true,
      totalPaise: true,
      paymentMethod: true,
      paymentStatus: true,
      notes: true,
      user: { select: { name: true, phone: true } },
      assignment: {
        select: { partner: { select: { user: { select: { name: true, phone: true } } } } },
      },
      items: {
        select: {
          productId: true,
          variantId: true,
          nameSnapshot: true,
          quantity: true,
          mealSlot: true,
          isSubstituted: true,
          originalProductId: true,
          variant: {
            select: {
              quantity: true,
              unit: true,
              stockQty: true,
              product: { select: { nameEn: true, nameMr: true, nameHi: true } },
            },
          },
        },
      },
    },
  });

  // ── Names of substituted-away products, so the slip can say what it replaced.
  const originalIds = [
    ...new Set(
      orders.flatMap((order) =>
        order.items
          .map((item) => item.originalProductId)
          .filter((id): id is string => id !== null),
      ),
    ),
  ];

  const originals =
    originalIds.length > 0
      ? await db.product.findMany({
          where: { id: { in: originalIds } },
          select: { id: true, nameEn: true, nameMr: true, nameHi: true },
        })
      : [];

  const originalNameById = new Map(
    originals.map((product) => [
      product.id,
      locale === 'mr' ? product.nameMr : locale === 'hi' ? product.nameHi : product.nameEn,
    ]),
  );

  // ── Aggregate.
  //
  // Summed in the VARIANT'S unit, not per line. Four orders of 500 g must read
  // as "2 kg", because that is what the owner asks for at the mandi — nobody
  // buys "four times five hundred grams".
  const byVariant = new Map<string, PicklistLine>();

  for (const order of orders) {
    for (const item of order.items) {
      const unitQuantity = item.variant?.quantity ?? 1;
      const unit = (item.variant?.unit ?? 'G') as QuantityUnit;
      const total = unitQuantity * item.quantity;

      const existing = byVariant.get(item.variantId);

      if (existing) {
        existing.totalQuantity += total;
        existing.orderCount += 1;
      } else {
        byVariant.set(item.variantId, {
          productId: item.productId,
          variantId: item.variantId,
          name: item.nameSnapshot,
          totalQuantity: total,
          unit,
          orderCount: 1,
          displayQuantity: '',
          stockQty: (item.variant?.stockQty ?? 0) * unitQuantity,
          shortfall: 0,
        });
      }
    }
  }

  const lines = [...byVariant.values()]
    .map((line) => ({
      ...line,
      displayQuantity: formatQuantity(line.totalQuantity, line.unit),
      shortfall: Math.max(0, line.totalQuantity - line.stockQty),
    }))
    // Heaviest first: it is the order the owner walks the market in.
    .sort((a, b) => b.totalQuantity - a.totalQuantity || a.name.localeCompare(b.name));

  // ── Packing slips.
  const slips: PackingSlip[] = orders.map((order) => {
    const address = parseAddress(order.addressSnapshot);

    const toItem = (item: (typeof order.items)[number]): PackingSlipItem => {
      const unitQuantity = item.variant?.quantity ?? 1;
      const unit = (item.variant?.unit ?? 'G') as QuantityUnit;
      const total = unitQuantity * item.quantity;

      return {
        name: item.nameSnapshot,
        quantity: total,
        unit,
        displayQuantity: formatQuantity(total, unit),
        slot: item.mealSlot,
        isSubstituted: item.isSubstituted,
        originalName: item.originalProductId
          ? (originalNameById.get(item.originalProductId) ?? null)
          : null,
      };
    };

    const items = order.items.map(toItem);

    return {
      orderId: order.id,
      orderNumber: order.orderNumber,
      customerName: order.user.name ?? order.user.phone,
      customerPhone: order.user.phone,
      address: [address.line1, address.line2, address.city, address.pincode]
        .filter(Boolean)
        .join(', '),
      landmark: address.landmark,
      deliverySlot: order.deliverySlot,
      riderName: order.assignment?.partner.user.name ?? null,
      // B1 — सकाळी / संध्याकाळी headers.
      morning: items.filter((item) => item.slot === 'MORNING'),
      evening: items.filter((item) => item.slot === 'EVENING'),
      unslotted: items.filter((item) => item.slot === null),
      totalPaise: order.totalPaise,
      paymentMethod: order.paymentMethod,
      paymentStatus: order.paymentStatus,
      notes: order.notes,
    };
  });

  return {
    dateKey,
    orderCount: orders.length,
    lines,
    slips,
    shortfallCount: lines.filter((line) => line.shortfall > 0).length,
  };
}

/** Defaults to tomorrow — the picklist is prepared the evening before. */
export function defaultPicklistDate(now: Date = new Date()): string {
  return toDateKey(new Date(parseDateKey(istDateKeyOf(now)).getTime() + 86_400_000));
}

function parseAddress(snapshot: unknown): {
  line1: string;
  line2: string | null;
  landmark: string | null;
  city: string;
  pincode: string;
} {
  const raw = (snapshot ?? {}) as Record<string, unknown>;
  const str = (key: string) => (typeof raw[key] === 'string' ? (raw[key] as string) : '');
  const nullable = (key: string) => (typeof raw[key] === 'string' ? (raw[key] as string) : null);

  return {
    line1: str('line1'),
    line2: nullable('line2'),
    landmark: nullable('landmark'),
    city: str('city'),
    pincode: str('pincode'),
  };
}

/**
 * CSV for the aggregate list (M9: "Printable + CSV").
 *
 * The owner opens this on a phone at the mandi, or hands it to whoever is
 * buying. Excel on Windows reads UTF-8 correctly only with a BOM, and without
 * one every Marathi vegetable name arrives as mojibake — which would make the
 * whole export useless for exactly the person it is for.
 */
export function picklistToCsv(picklist: Picklist): string {
  const escape = (value: string) => `"${value.replace(/"/g, '""')}"`;

  const rows = [
    ['Item', 'Quantity', 'Unit', 'Orders', 'In stock', 'Short by'].map(escape).join(','),
    ...picklist.lines.map((line) =>
      [
        escape(line.name),
        String(line.totalQuantity),
        escape(line.unit),
        String(line.orderCount),
        String(line.stockQty),
        String(line.shortfall),
      ].join(','),
    ),
  ];

  return `﻿${rows.join('\r\n')}\r\n`;
}
