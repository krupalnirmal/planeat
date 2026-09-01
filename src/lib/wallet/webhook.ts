import { db } from '@/lib/db';
import { ID_PREFIX, newId } from '@/lib/ids';
import type { WebhookEvent } from '@/lib/services/payment';
import { LEDGER_REF, credit } from './ledger';

/**
 * P2 — THE WEBHOOK IS THE SOURCE OF TRUTH.
 *
 * The wallet is credited (or the order marked paid) here and nowhere else.
 * The browser callback updates the UI optimistically and does nothing to
 * the balance or the order.
 *
 * That is not paranoia. The client handler can be tampered with, and it simply
 * does not fire when the app closes or the network drops mid-payment — which
 * on rural 4G happens constantly. Crediting from the callback would let users
 * credit themselves for free while honest users lose money they actually paid.
 *
 * Idempotency has two layers, because Razorpay retries and a replay must never
 * double-credit:
 *   1. `payments.gateway_payment_id` is unique.
 *   2. The ledger entry is unique on `(TOPUP, payment, gatewayPaymentId)`.
 * Either one alone would be enough; both together mean a partial failure
 * between them is still safe.
 *
 * One handler for two purposes (session 2026-09-01): `Payment.orderId`
 * (null for a wallet top-up, set for an order-checkout payment,
 * src/lib/orders/pay.ts) is the only thing that decides whether
 * "payment.captured" credits the wallet or marks an Order paid — the rest
 * of the flow (find the payment, verify nothing twice, store the raw
 * payload) is identical either way.
 */

export type WebhookOutcome =
  | { handled: true; action: 'CREDITED'; paymentId: string; amountPaise: bigint }
  | { handled: true; action: 'ALREADY_CREDITED'; paymentId: string }
  | { handled: true; action: 'ORDER_PAID'; paymentId: string; orderId: string }
  | { handled: true; action: 'ALREADY_PAID'; paymentId: string }
  | { handled: true; action: 'MARKED_FAILED'; paymentId: string }
  | { handled: true; action: 'STALE_FAILURE_IGNORED'; paymentId: string }
  | { handled: true; action: 'IGNORED'; reason: string };

/**
 * Finds the payment this event belongs to.
 *
 * `referenceId` is our own payment id, echoed back by the gateway. It is the
 * reliable link. The order id is the fallback for gateways that drop notes.
 */
const paymentSelect = { id: true, userId: true, orderId: true, amountPaise: true, status: true } as const;

async function findPayment(event: WebhookEvent) {
  if (event.referenceId) {
    const byReference = await db.payment.findUnique({
      where: { id: event.referenceId },
      select: paymentSelect,
    });
    if (byReference) return byReference;
  }

  if (event.gatewayPaymentId) {
    const byPaymentId = await db.payment.findUnique({
      where: { gatewayPaymentId: event.gatewayPaymentId },
      select: paymentSelect,
    });
    if (byPaymentId) return byPaymentId;
  }

  if (event.gatewayOrderId) {
    const byOrder = await db.payment.findFirst({
      where: { gatewayOrderId: event.gatewayOrderId },
      select: paymentSelect,
    });
    if (byOrder) return byOrder;
  }

  return null;
}

export async function handlePaymentWebhook(event: WebhookEvent): Promise<WebhookOutcome> {
  if (event.type === 'unknown') {
    return { handled: true, action: 'IGNORED', reason: 'Unsubscribed event type' };
  }

  const payment = await findPayment(event);
  if (!payment) {
    // Not ours, or a test event fired from the dashboard. Acknowledge it —
    // returning an error would make the gateway retry forever.
    return { handled: true, action: 'IGNORED', reason: 'No matching payment record' };
  }

  if (event.type === 'payment.failed') {
    const staleFailure = await db.$transaction(async (tx) => {
      // Guarded on the payment not already being PAID: a late "failed" event
      // for this same payment id must not clobber a captured payment's
      // status or overwrite its real gatewayPaymentId with the stale one.
      const updated = await tx.payment.updateMany({
        where: { id: payment.id, status: { not: 'PAID' } },
        data: {
          status: 'FAILED',
          gatewayPaymentId: event.gatewayPaymentId || null,
          signatureVerified: true,
          rawPayload: event.raw as never,
        },
      });
      if (updated.count === 0) return true;

      // An order-checkout attempt failing does not touch the order's stock
      // or its items — only that this particular payment attempt didn't
      // land. The customer retries by resubmitting checkout (same
      // idempotency key, src/lib/orders/create.ts), which re-enters
      // initiateOrderPayment for the same order rather than creating a
      // second one.
      //
      // Guarded on the order still being PENDING: gateways don't guarantee
      // webhook delivery order, so a late "failed" event for an abandoned
      // first attempt must not downgrade an order a SECOND, successful
      // attempt already marked PAID.
      if (payment.orderId) {
        await tx.order.updateMany({
          where: { id: payment.orderId, paymentStatus: 'PENDING' },
          data: { paymentStatus: 'FAILED' },
        });
      }
      return false;
    });
    if (staleFailure) {
      return { handled: true, action: 'STALE_FAILURE_IGNORED', paymentId: payment.id };
    }
    return { handled: true, action: 'MARKED_FAILED', paymentId: payment.id };
  }

  if (event.type === 'refund.processed') {
    await db.payment.update({
      where: { id: payment.id },
      data: { status: 'REFUNDED', rawPayload: event.raw as never },
    });
    return { handled: true, action: 'IGNORED', reason: 'Refund recorded' };
  }

  // ── payment.captured
  //
  // Credit the amount the GATEWAY reports, not the amount we asked for. If
  // they disagree, the gateway is the one holding the money.
  const amountPaise = event.amountPaise > 0n ? event.amountPaise : payment.amountPaise;

  if (payment.orderId) {
    const orderId = payment.orderId;
    return db.$transaction(async (tx) => {
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: 'PAID',
          gatewayPaymentId: event.gatewayPaymentId || null,
          gatewayOrderId: event.gatewayOrderId || undefined,
          signatureVerified: true,
          rawPayload: event.raw as never,
        },
      });

      // Conditional on still PENDING, same reasoning as the FAILED branch
      // above: idempotent against a replayed webhook (0 rows updated, no
      // error), and safe if two payment attempts for the same order both
      // somehow captured — only the first to arrive here wins the order.
      const result = await tx.order.updateMany({
        where: { id: orderId, paymentStatus: 'PENDING' },
        data: { paymentStatus: 'PAID' },
      });

      if (result.count === 0) {
        return { handled: true as const, action: 'ALREADY_PAID' as const, paymentId: payment.id };
      }
      return { handled: true as const, action: 'ORDER_PAID' as const, paymentId: payment.id, orderId };
    });
  }

  return db.$transaction(async (tx) => {
    await tx.payment.update({
      where: { id: payment.id },
      data: {
        status: 'PAID',
        gatewayPaymentId: event.gatewayPaymentId || null,
        gatewayOrderId: event.gatewayOrderId || undefined,
        signatureVerified: true,
        // P2 — the full raw payload is stored, so a dispute months later can be
        // settled against what the gateway actually sent.
        rawPayload: event.raw as never,
      },
    });

    const entry = await credit(
      {
        userId: payment.userId,
        amountPaise,
        source: 'TOPUP',
        ...LEDGER_REF.payment(event.gatewayPaymentId || payment.id),
        note: 'Wallet top-up',
      },
      tx,
    );

    if (entry.alreadyRecorded) {
      return { handled: true as const, action: 'ALREADY_CREDITED' as const, paymentId: payment.id };
    }

    return {
      handled: true as const,
      action: 'CREDITED' as const,
      paymentId: payment.id,
      amountPaise,
    };
  });
}

/**
 * A rejected signature is a security event, not a normal failure. It is
 * recorded so a pattern of them is visible in the audit log rather than only
 * in whatever server logs happen to be retained.
 */
export async function recordRejectedWebhook(reason: string, ip: string): Promise<void> {
  await db.auditLog.create({
    data: {
      id: newId(ID_PREFIX.auditLog),
      actorId: null,
      action: 'webhook.rejected',
      entityType: 'Payment',
      entityId: 'unknown',
      after: { reason },
      ip,
    },
  });
}
