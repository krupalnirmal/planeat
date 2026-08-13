import { db } from '@/lib/db';
import { ID_PREFIX, newId } from '@/lib/ids';
import { LEDGER_REF, credit } from '@/lib/wallet/ledger';
import { canTransition, isCustomerCancellable } from './status';
import type { OrderStatus } from '@/generated/prisma/enums';

/**
 * Order cancellation (M3).
 *
 * PART 12 — "Cancelling a PLACED order refunds the wallet exactly once."
 *
 * Three things have to happen together or not at all: the status change, the
 * stock going back, and the refund. The refund is idempotent on
 * `(REFUND, order_refund, orderId)`, so even a double-submitted cancel credits
 * once — and the status guard means the second call is refused anyway.
 */

export type CancelResult =
  | { ok: true; refundedPaise: bigint; alreadyRefunded: boolean }
  | { ok: false; reason: 'NOT_FOUND' | 'NOT_CANCELLABLE'; status?: OrderStatus };

export interface CancelOptions {
  orderId: string;
  /** The customer cancelling their own order, or an admin acting for them. */
  actorId: string;
  /** Admin cancellations bypass the customer-facing PACKED cutoff. */
  asAdmin?: boolean;
  reason?: string;
}

export async function cancelOrder(options: CancelOptions): Promise<CancelResult> {
  const order = await db.order.findUnique({
    where: { id: options.orderId },
    select: {
      id: true,
      userId: true,
      orderNumber: true,
      status: true,
      paymentMethod: true,
      paymentStatus: true,
      totalPaise: true,
      items: { select: { variantId: true, quantity: true } },
    },
  });

  if (!order) return { ok: false, reason: 'NOT_FOUND' };

  const allowed = options.asAdmin
    ? canTransition(order.status, 'CANCELLED')
    : isCustomerCancellable(order.status);

  if (!allowed) return { ok: false, reason: 'NOT_CANCELLABLE', status: order.status };

  return db.$transaction(async (tx) => {
    // Guarded update: if a rider marked it OUT_FOR_DELIVERY between the read
    // above and this write, zero rows change and we refuse rather than
    // cancelling an order already on a bike.
    const updated = await tx.order.updateMany({
      where: { id: order.id, status: order.status },
      data: { status: 'CANCELLED', cancelledAt: new Date() },
    });

    if (updated.count === 0) {
      return { ok: false as const, reason: 'NOT_CANCELLABLE' as const, status: order.status };
    }

    await tx.orderStatusHistory.create({
      data: {
        id: newId(ID_PREFIX.orderStatus),
        orderId: order.id,
        fromStatus: order.status,
        toStatus: 'CANCELLED',
        changedBy: options.actorId,
        reason: options.reason ?? 'Cancelled by customer',
      },
    });

    // Stock goes back. Nothing was picked yet — that is exactly why the cutoff
    // is PACKED.
    for (const item of order.items) {
      await tx.productVariant.updateMany({
        where: { id: item.variantId },
        data: { stockQty: { increment: item.quantity } },
      });
    }

    // P3 — refunds go to the wallet, never silently nowhere. A COD order that
    // was never paid has nothing to refund.
    const shouldRefund = order.paymentStatus === 'PAID' && order.totalPaise > 0n;

    if (!shouldRefund) {
      await tx.order.update({
        where: { id: order.id },
        data: { paymentStatus: order.paymentStatus === 'PAID' ? 'REFUNDED' : order.paymentStatus },
      });
      return { ok: true as const, refundedPaise: 0n, alreadyRefunded: false };
    }

    const refund = await credit(
      {
        userId: order.userId,
        amountPaise: order.totalPaise,
        source: 'CANCELLATION',
        ...LEDGER_REF.orderRefund(order.id),
        note: `Refund for cancelled order ${order.orderNumber}`,
        createdBy: options.actorId,
      },
      tx,
    );

    await tx.order.update({
      where: { id: order.id },
      data: { paymentStatus: 'REFUNDED' },
    });

    return {
      ok: true as const,
      refundedPaise: order.totalPaise,
      alreadyRefunded: refund.alreadyRecorded,
    };
  });
}
