import { db } from '@/lib/db';
import { istDateKey } from '@/lib/cron';
import { formatQuantity, type QuantityUnit } from '@/lib/quantity';
import type { DeliveryAssignmentStatus, DeliverySlot, MealSlot } from '@/generated/prisma/enums';

/**
 * M10 — "Today's assigned orders sorted by slot" and the order detail a rider
 * actually needs on a doorstep: customer name, click-to-call, address, a map
 * link, and an item checklist. Nothing here is ever the delivery OTP itself —
 * that only ever renders on the CUSTOMER's screen (`src/lib/orders/queries.ts`),
 * so asking for it at the door is the whole point of the check.
 */

export interface DeliveryOrderItem {
  name: string;
  quantity: number;
  unit: QuantityUnit;
  displayQuantity: string;
  slot: MealSlot | null;
}

export interface DeliveryOrderRow {
  assignmentId: string;
  orderId: string;
  orderNumber: string;
  status: DeliveryAssignmentStatus;
  deliverySlot: DeliverySlot | null;
  customerName: string;
  customerPhone: string;
  address: {
    line1: string;
    line2: string | null;
    landmark: string | null;
    city: string;
    pincode: string;
    /** Only present when the address was saved with a location pin. */
    mapUrl: string | null;
  };
  items: DeliveryOrderItem[];
  totalPaise: bigint;
  paymentMethod: string;
  isCod: boolean;
  failureReason: string | null;
}

const ACTIVE_STATUSES: DeliveryAssignmentStatus[] = [
  'ASSIGNED',
  'PICKED_UP',
  'OUT_FOR_DELIVERY',
];

function parseAddress(snapshot: unknown): DeliveryOrderRow['address'] {
  const raw = (snapshot ?? {}) as Record<string, unknown>;
  const str = (key: string) => (typeof raw[key] === 'string' ? (raw[key] as string) : '');
  const nullable = (key: string) => (typeof raw[key] === 'string' ? (raw[key] as string) : null);
  const lat = typeof raw.latitude === 'number' ? raw.latitude : null;
  const lng = typeof raw.longitude === 'number' ? raw.longitude : null;

  return {
    line1: str('line1'),
    line2: nullable('line2'),
    landmark: nullable('landmark'),
    city: str('city'),
    pincode: str('pincode'),
    mapUrl: lat !== null && lng !== null ? `https://maps.google.com/?q=${lat},${lng}` : null,
  };
}

/**
 * Every assignment for today, regardless of status — a rider needs to see
 * what is done alongside what is left, not have completed drops vanish from
 * the list the moment they are finished.
 */
export async function listTodayAssignments(partnerId: string): Promise<DeliveryOrderRow[]> {
  const dateKey = istDateKey();
  const dayStart = new Date(`${dateKey}T00:00:00.000Z`);
  const dayEnd = new Date(`${dateKey}T23:59:59.999Z`);

  const assignments = await db.deliveryAssignment.findMany({
    where: {
      partnerId,
      assignedAt: { gte: dayStart, lte: dayEnd },
    },
    orderBy: { assignedAt: 'asc' },
    select: {
      id: true,
      status: true,
      failureReason: true,
      order: {
        select: {
          id: true,
          orderNumber: true,
          addressSnapshot: true,
          deliverySlot: true,
          totalPaise: true,
          paymentMethod: true,
          paymentStatus: true,
          user: { select: { name: true, phone: true } },
          items: {
            select: {
              nameSnapshot: true,
              quantity: true,
              mealSlot: true,
              variant: { select: { quantity: true, unit: true } },
            },
          },
        },
      },
    },
  });

  const rows = assignments.map((assignment) => ({
    assignmentId: assignment.id,
    orderId: assignment.order.id,
    orderNumber: assignment.order.orderNumber,
    status: assignment.status,
    deliverySlot: assignment.order.deliverySlot,
    customerName: assignment.order.user.name ?? assignment.order.user.phone,
    customerPhone: assignment.order.user.phone,
    address: parseAddress(assignment.order.addressSnapshot),
    items: assignment.order.items.map((item) => {
      const unitQuantity = item.variant?.quantity ?? 1;
      const unit = (item.variant?.unit ?? 'G') as QuantityUnit;
      const total = unitQuantity * item.quantity;
      return {
        name: item.nameSnapshot,
        quantity: total,
        unit,
        displayQuantity: formatQuantity(total, unit),
        slot: item.mealSlot,
      };
    }),
    totalPaise: assignment.order.totalPaise,
    paymentMethod: assignment.order.paymentMethod,
    isCod: assignment.order.paymentMethod === 'COD' && assignment.order.paymentStatus !== 'PAID',
    failureReason: assignment.failureReason,
  }));

  // Not-yet-delivered first, in assignment order (roughly the packing/route
  // order); finished ones sink to the bottom without disappearing.
  return rows.sort((a, b) => {
    const aDone = !ACTIVE_STATUSES.includes(a.status);
    const bDone = !ACTIVE_STATUSES.includes(b.status);
    if (aDone !== bDone) return aDone ? 1 : -1;
    return 0;
  });
}

/** One order, scoped to the requesting rider — used by the detail screen. */
export async function getAssignmentDetail(
  partnerId: string,
  orderId: string,
): Promise<DeliveryOrderRow | null> {
  const assignment = await db.deliveryAssignment.findFirst({
    where: { orderId, partnerId },
    select: {
      id: true,
      status: true,
      failureReason: true,
      order: {
        select: {
          id: true,
          orderNumber: true,
          addressSnapshot: true,
          deliverySlot: true,
          totalPaise: true,
          paymentMethod: true,
          paymentStatus: true,
          user: { select: { name: true, phone: true } },
          items: {
            select: {
              nameSnapshot: true,
              quantity: true,
              mealSlot: true,
              variant: { select: { quantity: true, unit: true } },
            },
          },
        },
      },
    },
  });

  if (!assignment) return null;

  return {
    assignmentId: assignment.id,
    orderId: assignment.order.id,
    orderNumber: assignment.order.orderNumber,
    status: assignment.status,
    deliverySlot: assignment.order.deliverySlot,
    customerName: assignment.order.user.name ?? assignment.order.user.phone,
    customerPhone: assignment.order.user.phone,
    address: parseAddress(assignment.order.addressSnapshot),
    items: assignment.order.items.map((item) => {
      const unitQuantity = item.variant?.quantity ?? 1;
      const unit = (item.variant?.unit ?? 'G') as QuantityUnit;
      const total = unitQuantity * item.quantity;
      return {
        name: item.nameSnapshot,
        quantity: total,
        unit,
        displayQuantity: formatQuantity(total, unit),
        slot: item.mealSlot,
      };
    }),
    totalPaise: assignment.order.totalPaise,
    paymentMethod: assignment.order.paymentMethod,
    isCod: assignment.order.paymentMethod === 'COD' && assignment.order.paymentStatus !== 'PAID',
    failureReason: assignment.failureReason,
  };
}

export interface DailySummary {
  dateKey: string;
  delivered: number;
  failed: number;
  pending: number;
  codCollectedPaise: bigint;
}

/** M10 — "Daily summary including COD cash collected." */
export async function getDailySummary(partnerId: string): Promise<DailySummary> {
  const dateKey = istDateKey();
  const dayStart = new Date(`${dateKey}T00:00:00.000Z`);
  const dayEnd = new Date(`${dateKey}T23:59:59.999Z`);

  const assignments = await db.deliveryAssignment.findMany({
    where: { partnerId, assignedAt: { gte: dayStart, lte: dayEnd } },
    select: {
      status: true,
      order: { select: { totalPaise: true, paymentMethod: true } },
    },
  });

  let delivered = 0;
  let failed = 0;
  let pending = 0;
  let codCollectedPaise = 0n;

  for (const assignment of assignments) {
    if (assignment.status === 'DELIVERED') {
      delivered += 1;
      // COD cash only changes hands once the bag is actually handed over.
      if (assignment.order.paymentMethod === 'COD') {
        codCollectedPaise += assignment.order.totalPaise;
      }
    } else if (assignment.status === 'FAILED') {
      failed += 1;
    } else {
      pending += 1;
    }
  }

  return { dateKey, delivered, failed, pending, codCollectedPaise };
}
