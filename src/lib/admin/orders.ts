import { db } from '@/lib/db';
import { ID_PREFIX, newId } from '@/lib/ids';
import { parseDateKey } from '@/lib/meal-plan/pricing';
import { TEMPLATE, notifyEvent } from '@/lib/notifications/notify';
import { canTransition } from '@/lib/orders/status';
import type { OrderStatus, OrderType } from '@/generated/prisma/enums';
import { audit } from './audit';

/**
 * M9 — Orders: filters, detail, status change, assign rider (B12),
 * cancel/refund.
 *
 * Cancel and refund reuse `cancelOrder` from Phase 2 with `asAdmin: true` —
 * there is deliberately no second cancellation path, because two of them would
 * eventually disagree about whether the wallet was credited.
 */

export interface AdminOrderFilter {
  status?: OrderStatus;
  type?: OrderType;
  dateKey?: string;
  query?: string;
  unassignedOnly?: boolean;
}

export interface AdminOrderRow {
  id: string;
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  type: OrderType;
  status: OrderStatus;
  paymentMethod: string;
  paymentStatus: string;
  totalPaise: bigint;
  itemCount: number;
  placedAt: Date;
  scheduledDate: Date | null;
  riderName: string | null;
  pincode: string;
}

export async function listAdminOrders(
  filter: AdminOrderFilter,
  { skip, take }: { skip: number; take: number },
): Promise<{ orders: AdminOrderRow[]; total: number }> {
  const scheduled = filter.dateKey ? parseDateKey(filter.dateKey) : null;

  const where = {
    ...(filter.status ? { status: filter.status } : {}),
    ...(filter.type ? { type: filter.type } : {}),
    ...(scheduled ? { scheduledDate: scheduled } : {}),
    ...(filter.unassignedOnly ? { assignment: { is: null } } : {}),
    ...(filter.query
      ? {
          OR: [
            { orderNumber: { contains: filter.query } },
            { user: { phone: { contains: filter.query } } },
            { user: { name: { contains: filter.query } } },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    db.order.findMany({
      where,
      orderBy: { placedAt: 'desc' },
      skip,
      take,
      select: {
        id: true,
        orderNumber: true,
        type: true,
        status: true,
        paymentMethod: true,
        paymentStatus: true,
        totalPaise: true,
        placedAt: true,
        scheduledDate: true,
        addressSnapshot: true,
        user: { select: { name: true, phone: true } },
        _count: { select: { items: true } },
        assignment: {
          select: { partner: { select: { user: { select: { name: true } } } } },
        },
      },
    }),
    db.order.count({ where }),
  ]);

  return {
    total,
    orders: rows.map((row) => {
      const address = (row.addressSnapshot ?? {}) as Record<string, unknown>;
      return {
        id: row.id,
        orderNumber: row.orderNumber,
        customerName: row.user.name ?? row.user.phone,
        customerPhone: row.user.phone,
        type: row.type,
        status: row.status,
        paymentMethod: row.paymentMethod,
        paymentStatus: row.paymentStatus,
        totalPaise: row.totalPaise,
        itemCount: row._count.items,
        placedAt: row.placedAt,
        scheduledDate: row.scheduledDate,
        riderName: row.assignment?.partner.user.name ?? null,
        pincode: typeof address.pincode === 'string' ? address.pincode : '',
      };
    }),
  };
}

// ─────────────────────────────────────────────────────────────
// Status changes
// ─────────────────────────────────────────────────────────────

export type StatusChangeResult =
  | { ok: true; from: OrderStatus; to: OrderStatus }
  | { ok: false; reason: 'NOT_FOUND' | 'ILLEGAL_TRANSITION'; from?: OrderStatus };

/**
 * The same state machine the customer app and the rider app use. A separate
 * admin path would eventually allow a transition the other two refuse, and
 * nobody would find out until an order went from DELIVERED back to PLACED.
 */
export async function changeOrderStatus(
  orderId: string,
  to: OrderStatus,
  actorId: string,
  reason: string | null,
  ip: string | null,
): Promise<StatusChangeResult> {
  const order = await db.order.findUnique({
    where: { id: orderId },
    select: { id: true, status: true, orderNumber: true, userId: true },
  });

  if (!order) return { ok: false, reason: 'NOT_FOUND' };
  if (!canTransition(order.status, to)) {
    return { ok: false, reason: 'ILLEGAL_TRANSITION', from: order.status };
  }

  await db.$transaction(async (tx) => {
    // Guarded on the status we read, so two admins clicking at once cannot
    // both apply a transition.
    const updated = await tx.order.updateMany({
      where: { id: orderId, status: order.status },
      data: {
        status: to,
        ...(to === 'DELIVERED' ? { deliveredAt: new Date() } : {}),
        ...(to === 'CANCELLED' ? { cancelledAt: new Date() } : {}),
      },
    });

    if (updated.count === 0) throw new Error('Order status changed underneath us');

    await tx.orderStatusHistory.create({
      data: {
        id: newId(ID_PREFIX.orderStatus),
        orderId,
        fromStatus: order.status,
        toStatus: to,
        changedBy: actorId,
        reason: reason ?? 'Changed by admin',
      },
    });
  });

  await audit({
    actorId,
    action: 'order.status_change',
    entityType: 'Order',
    entityId: orderId,
    before: { status: order.status },
    after: { status: to, reason },
    ip,
  });

  // M8 — "Order status changes" (Push + in-app). Outside the transaction: a
  // failed notification must never undo a status change that already landed.
  await notifyEvent(order.userId, TEMPLATE.orderStatusChanged, {
    orderId,
    orderNumber: order.orderNumber,
    status: to,
  });

  return { ok: true, from: order.status, to };
}

// ─────────────────────────────────────────────────────────────
// B12 — rider assignment: suggest, never auto-assign
// ─────────────────────────────────────────────────────────────

export interface RiderSuggestion {
  orderId: string;
  orderNumber: string;
  pincode: string;
  suggestedPartnerId: string | null;
  suggestedPartnerName: string | null;
  /** Why this rider — shown so the owner can disagree with a reason. */
  rationale: 'SAME_AREA_LIGHTEST_LOAD' | 'LIGHTEST_LOAD' | 'NO_RIDER_AVAILABLE';
}

/**
 * B12 — "The system suggests; the owner confirms with one tap … No
 * auto-assignment."
 *
 *   "With two or three riders the owner knows things the system does not."
 *
 * So this returns suggestions and nothing else. It never writes an assignment.
 * The suggestion is: an available rider in the order's service area, with the
 * fewest deliveries already assigned today.
 */
export async function suggestRiders(dateKey: string): Promise<RiderSuggestion[]> {
  const scheduledDate = parseDateKey(dateKey);
  const dayStart = new Date(`${dateKey}T00:00:00.000Z`);
  const dayEnd = new Date(`${dateKey}T23:59:59.999Z`);

  const [orders, partners, todaysAssignments] = await Promise.all([
    db.order.findMany({
      where: {
        assignment: { is: null },
        status: { in: ['PLACED', 'CONFIRMED', 'PACKED'] },
        OR: [{ scheduledDate }, { scheduledDate: null, placedAt: { gte: dayStart, lte: dayEnd } }],
      },
      orderBy: { placedAt: 'asc' },
      select: { id: true, orderNumber: true, addressSnapshot: true },
    }),
    db.deliveryPartner.findMany({
      where: { isAvailable: true },
      select: {
        id: true,
        serviceArea: { select: { pincode: true } },
        user: { select: { name: true, phone: true } },
      },
    }),
    db.deliveryAssignment.groupBy({
      by: ['partnerId'],
      where: { assignedAt: { gte: dayStart, lte: dayEnd } },
      _count: { partnerId: true },
    }),
  ]);

  const loadByPartner = new Map(
    todaysAssignments.map((entry) => [entry.partnerId, entry._count.partnerId]),
  );

  // Mutable, so suggestions within one run spread across riders rather than
  // all landing on whoever started the morning idle.
  const projectedLoad = new Map(
    partners.map((partner) => [partner.id, loadByPartner.get(partner.id) ?? 0]),
  );

  return orders.map((order) => {
    const address = (order.addressSnapshot ?? {}) as Record<string, unknown>;
    const pincode = typeof address.pincode === 'string' ? address.pincode : '';

    const sameArea = partners.filter((partner) => partner.serviceArea?.pincode === pincode);
    const pool = sameArea.length > 0 ? sameArea : partners;

    if (pool.length === 0) {
      return {
        orderId: order.id,
        orderNumber: order.orderNumber,
        pincode,
        suggestedPartnerId: null,
        suggestedPartnerName: null,
        rationale: 'NO_RIDER_AVAILABLE' as const,
      };
    }

    const chosen = [...pool].sort(
      (a, b) =>
        (projectedLoad.get(a.id) ?? 0) - (projectedLoad.get(b.id) ?? 0) ||
        a.id.localeCompare(b.id),
    )[0];

    projectedLoad.set(chosen.id, (projectedLoad.get(chosen.id) ?? 0) + 1);

    return {
      orderId: order.id,
      orderNumber: order.orderNumber,
      pincode,
      suggestedPartnerId: chosen.id,
      suggestedPartnerName: chosen.user.name ?? chosen.user.phone,
      rationale: sameArea.length > 0 ? ('SAME_AREA_LIGHTEST_LOAD' as const) : ('LIGHTEST_LOAD' as const),
    };
  });
}

export type AssignResult =
  | { ok: true; assignmentId: string }
  | { ok: false; reason: 'ORDER_NOT_FOUND' | 'PARTNER_NOT_FOUND' | 'ALREADY_ASSIGNED' };

/** A 4-digit code the customer reads out at the door (M10). */
function newDeliveryOtp(): string {
  const bytes = new Uint32Array(1);
  crypto.getRandomValues(bytes);
  return String(bytes[0] % 10_000).padStart(4, '0');
}

export async function assignRider(
  orderId: string,
  partnerId: string,
  actorId: string,
  ip: string | null,
): Promise<AssignResult> {
  const [order, partner] = await Promise.all([
    db.order.findUnique({
      where: { id: orderId },
      select: { id: true, orderNumber: true, assignment: { select: { id: true } } },
    }),
    db.deliveryPartner.findUnique({ where: { id: partnerId }, select: { id: true } }),
  ]);

  if (!order) return { ok: false, reason: 'ORDER_NOT_FOUND' };
  if (!partner) return { ok: false, reason: 'PARTNER_NOT_FOUND' };
  if (order.assignment) return { ok: false, reason: 'ALREADY_ASSIGNED' };

  const assignmentId = newId(ID_PREFIX.deliveryAssignment);

  await db.deliveryAssignment.create({
    data: {
      id: assignmentId,
      orderId,
      partnerId,
      status: 'ASSIGNED',
      // Generated now so it is on the customer's order screen before the
      // rider ever sets out. It is deliberately never shown to the rider or
      // printed on the picklist — the whole point is that only the customer
      // can read it out at the door (M10).
      deliveryOtp: newDeliveryOtp(),
    },
  });

  await audit({
    actorId,
    action: 'order.assign_rider',
    entityType: 'Order',
    entityId: orderId,
    after: { partnerId, orderNumber: order.orderNumber },
    ip,
  });

  return { ok: true, assignmentId };
}
