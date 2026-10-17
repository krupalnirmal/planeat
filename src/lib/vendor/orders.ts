import { db } from '@/lib/db';
import type { OrderStatus, OrderType, DeliveryAssignmentStatus } from '@/generated/prisma/enums';

/**
 * Vendor order-packing reads (session 2026-10-16) — the second half of the
 * Vendor role, alongside `src/lib/vendor/supplies.ts`. Orders arrive here
 * pre-scoped by `Order.vendorId`, set once at placement time by
 * `placeOrder()` (`src/lib/orders/create.ts`) via service-area matching.
 *
 * Deliberately excludes customer name/phone/address — a vendor needs to
 * know what to pack, not who for, the same "vendor never sees customer
 * data" boundary `src/lib/vendor/supplies.ts` already keeps. The order
 * number is enough to label a bag.
 */

export interface VendorOrderItemView {
  name: string;
  quantity: number;
}

export interface VendorOrderAssignment {
  status: DeliveryAssignmentStatus;
  partnerName: string;
}

export interface VendorOrderRow {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  /** Lets the vendor tell a meal-plan subscriber's order apart from a
      one-off purchase — packed exactly the same way, but worth knowing
      (session 2026-10-17). */
  type: OrderType;
  placedAt: Date;
  items: VendorOrderItemView[];
  /** Who picked this up, once admin assigns a rider — the "which delivery
      partner took my packed order" visibility the vendor needs. */
  assignment: VendorOrderAssignment | null;
}

const ORDER_SELECT = {
  id: true,
  orderNumber: true,
  status: true,
  type: true,
  placedAt: true,
  items: { select: { nameSnapshot: true, quantity: true } },
  assignment: {
    select: {
      status: true,
      partner: { select: { user: { select: { name: true } } } },
    },
  },
} as const;

function toRow(order: {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  type: OrderType;
  placedAt: Date;
  items: Array<{ nameSnapshot: string; quantity: number }>;
  assignment: { status: DeliveryAssignmentStatus; partner: { user: { name: string | null } } } | null;
}): VendorOrderRow {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    type: order.type,
    placedAt: order.placedAt,
    items: order.items.map((item) => ({ name: item.nameSnapshot, quantity: item.quantity })),
    assignment: order.assignment
      ? {
          status: order.assignment.status,
          partnerName: order.assignment.partner.user.name ?? 'Delivery partner',
        }
      : null,
  };
}

/** Every order routed to this vendor, newest-placed last — matches the
    "today's queue, oldest first" expectation of a packing counter. */
export async function listVendorOrders(vendorId: string): Promise<VendorOrderRow[]> {
  const orders = await db.order.findMany({
    where: { vendorId, status: { in: ['PLACED', 'CONFIRMED', 'PACKED'] } },
    orderBy: { placedAt: 'asc' },
    select: ORDER_SELECT,
  });

  return orders.map(toRow);
}

/** The pack route's ownership gate, extracted so it's unit-testable — routes
    themselves have no test coverage in this codebase, business logic does. */
export async function vendorOwnsOrder(vendorId: string, orderId: string): Promise<boolean> {
  const order = await db.order.findUnique({ where: { id: orderId }, select: { vendorId: true } });
  return order?.vendorId === vendorId;
}

/** Ownership-gated: an order that exists but belongs to another vendor
    returns `null`, same shape as `getOrderDetail`'s own-customer check in
    `src/lib/orders/queries.ts`. */
export async function getVendorOrderDetail(
  vendorId: string,
  orderId: string,
): Promise<VendorOrderRow | null> {
  const order = await db.order.findUnique({
    where: { id: orderId },
    select: { ...ORDER_SELECT, vendorId: true },
  });

  if (!order || order.vendorId !== vendorId) return null;

  return toRow(order);
}
