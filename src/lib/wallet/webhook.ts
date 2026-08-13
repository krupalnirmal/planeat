import { db } from '@/lib/db';
import { ID_PREFIX, newId } from '@/lib/ids';
import type { WebhookEvent } from '@/lib/services/payment';
import { LEDGER_REF, credit } from './ledger';

/**
 * P2 — THE WEBHOOK IS THE SOURCE OF TRUTH.
 *
 * The wallet is credited here and nowhere else. The browser callback updates
 * the UI optimistically and does nothing to the balance.
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
 */

export type WebhookOutcome =
  | { handled: true; action: 'CREDITED'; paymentId: string; amountPaise: bigint }
  | { handled: true; action: 'ALREADY_CREDITED'; paymentId: string }
  | { handled: true; action: 'MARKED_FAILED'; paymentId: string }
  | { handled: true; action: 'IGNORED'; reason: string };

/**
 * Finds the payment this event belongs to.
 *
 * `referenceId` is our own payment id, echoed back by the gateway. It is the
 * reliable link. The order id is the fallback for gateways that drop notes.
 */
async function findPayment(event: WebhookEvent) {
  if (event.referenceId) {
    const byReference = await db.payment.findUnique({
      where: { id: event.referenceId },
      select: { id: true, userId: true, amountPaise: true, status: true },
    });
    if (byReference) return byReference;
  }

  if (event.gatewayPaymentId) {
    const byPaymentId = await db.payment.findUnique({
      where: { gatewayPaymentId: event.gatewayPaymentId },
      select: { id: true, userId: true, amountPaise: true, status: true },
    });
    if (byPaymentId) return byPaymentId;
  }

  if (event.gatewayOrderId) {
    const byOrder = await db.payment.findFirst({
      where: { gatewayOrderId: event.gatewayOrderId },
      select: { id: true, userId: true, amountPaise: true, status: true },
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
    await db.payment.update({
      where: { id: payment.id },
      data: {
        status: 'FAILED',
        gatewayPaymentId: event.gatewayPaymentId || null,
        signatureVerified: true,
        rawPayload: event.raw as never,
      },
    });
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
