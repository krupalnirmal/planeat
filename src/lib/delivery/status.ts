import { db } from '@/lib/db';
import { ID_PREFIX, newId } from '@/lib/ids';
import { TEMPLATE, notifyEvent } from '@/lib/notifications/notify';
import { canTransition } from '@/lib/orders/status';
import type { DeliveryAssignmentStatus, OrderStatus } from '@/generated/prisma/enums';

/**
 * M10 — "Status: Picked Up → Out for Delivery → Delivered." Plus "Mark Failed
 * Delivery with reason" from any of those three.
 *
 * Two state machines move together but are not the same machine. The
 * assignment's is the rider's own three (four, with the implicit ASSIGNED
 * start) steps; the order's is the five-status machine the customer app,
 * admin panel and this all share (`src/lib/orders/status.ts`). A pickup only
 * ever advances the order into OUT_FOR_DELIVERY — the finer PICKED_UP /
 * OUT_FOR_DELIVERY distinction is a rider-side detail the customer does not
 * need a separate status for.
 */

const ASSIGNMENT_TRANSITIONS: Record<
  DeliveryAssignmentStatus,
  readonly DeliveryAssignmentStatus[]
> = {
  ASSIGNED: ['PICKED_UP', 'FAILED'],
  PICKED_UP: ['OUT_FOR_DELIVERY', 'FAILED'],
  OUT_FOR_DELIVERY: ['DELIVERED', 'FAILED'],
  DELIVERED: [],
  FAILED: [],
};

/** Which assignment steps also move the customer-facing order status. */
const ORDER_STATUS_FOR: Partial<Record<DeliveryAssignmentStatus, OrderStatus>> = {
  PICKED_UP: 'OUT_FOR_DELIVERY',
  DELIVERED: 'DELIVERED',
  FAILED: 'FAILED_DELIVERY',
};

export type AdvanceResult =
  | { ok: true }
  | {
      ok: false;
      reason:
        | 'NOT_FOUND'
        | 'ILLEGAL_TRANSITION'
        // The bags are not marked PACKED yet — a rider cannot pick up what
        // the admin has not finished packing.
        | 'ORDER_NOT_READY'
        | 'WRONG_OTP'
        | 'PROOF_REQUIRED'
        | 'REASON_REQUIRED';
    };

export interface AdvanceInput {
  orderId: string;
  partnerId: string;
  to: DeliveryAssignmentStatus;
  otp?: string;
  proofImageUrl?: string;
  failureReason?: string;
}

export async function advanceAssignment(input: AdvanceInput): Promise<AdvanceResult> {
  const assignment = await db.deliveryAssignment.findFirst({
    where: { orderId: input.orderId, partnerId: input.partnerId },
    select: {
      id: true,
      status: true,
      deliveryOtp: true,
      order: { select: { id: true, userId: true, orderNumber: true, status: true } },
    },
  });

  // Scoped to the requesting rider in the query itself, so an assignment
  // belonging to someone else reads as NOT_FOUND rather than leaking that it
  // exists.
  if (!assignment) return { ok: false, reason: 'NOT_FOUND' };

  if (!ASSIGNMENT_TRANSITIONS[assignment.status].includes(input.to)) {
    return { ok: false, reason: 'ILLEGAL_TRANSITION' };
  }

  if (input.to === 'DELIVERED') {
    // Either is sufficient (M10): a photo is its own independent proof, so it
    // is checked first rather than being blocked by an OTP field the rider
    // never meant to fill in.
    if (input.proofImageUrl) {
      // Accepted on the photo alone.
    } else if (input.otp) {
      if (input.otp !== assignment.deliveryOtp) return { ok: false, reason: 'WRONG_OTP' };
    } else {
      return { ok: false, reason: 'PROOF_REQUIRED' };
    }
  }

  if (input.to === 'FAILED' && !input.failureReason?.trim()) {
    return { ok: false, reason: 'REASON_REQUIRED' };
  }

  const orderTo = ORDER_STATUS_FOR[input.to];
  if (orderTo && !canTransition(assignment.order.status, orderTo)) {
    return { ok: false, reason: 'ORDER_NOT_READY' };
  }

  await db.$transaction(async (tx) => {
    const updated = await tx.deliveryAssignment.updateMany({
      where: { id: assignment.id, status: assignment.status },
      data: {
        status: input.to,
        ...(input.to === 'PICKED_UP' ? { pickedAt: new Date() } : {}),
        ...(input.to === 'DELIVERED'
          ? { deliveredAt: new Date(), proofImageUrl: input.proofImageUrl ?? null }
          : {}),
        ...(input.to === 'FAILED' ? { failureReason: input.failureReason } : {}),
      },
    });

    // Two taps racing (a flaky connection retried mid-flight): the second
    // finds the status already moved and is refused rather than double-applied.
    if (updated.count === 0) throw new Error('Assignment status changed underneath us');

    if (orderTo) {
      await tx.order.updateMany({
        where: { id: assignment.order.id, status: assignment.order.status },
        data: {
          status: orderTo,
          ...(orderTo === 'DELIVERED' ? { deliveredAt: new Date() } : {}),
        },
      });

      await tx.orderStatusHistory.create({
        data: {
          id: newId(ID_PREFIX.orderStatus),
          orderId: assignment.order.id,
          fromStatus: assignment.order.status,
          toStatus: orderTo,
          changedBy: null,
          reason: `Delivery partner marked ${input.to}`,
        },
      });
    }
  });

  // M8 — "Order status changes" (Push + in-app). Outside the transaction so a
  // failed notification never undoes a delivery update that already landed.
  if (orderTo) {
    await notifyEvent(assignment.order.userId, TEMPLATE.orderStatusChanged, {
      orderId: assignment.order.id,
      orderNumber: assignment.order.orderNumber,
      status: orderTo,
    });
  }

  return { ok: true };
}
