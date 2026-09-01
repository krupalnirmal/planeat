import { db } from '@/lib/db';
import { env } from '@/lib/env';
import { ID_PREFIX, newId } from '@/lib/ids';
import { getPaymentProvider } from '@/lib/services/payment';

/**
 * Order-checkout payment via the gateway (session 2026-09-01) — the RAZORPAY
 * counterpart to `src/lib/wallet/topup.ts`'s wallet top-up, same shape and
 * same reasoning: this function takes money nowhere near the order. It
 * records a `Payment` row (linked to the order via `Payment.orderId`, the
 * one thing that tells `handlePaymentWebhook` this isn't a wallet top-up)
 * and hands the browser what it needs to open the gateway's checkout. The
 * order is marked paid only by a signature-verified webhook — see
 * `src/lib/wallet/webhook.ts`, which now handles both.
 *
 * The order itself already exists by the time this runs — `placeOrder`
 * (src/lib/orders/create.ts) creates it with `paymentStatus: PENDING` for
 * RAZORPAY and does not touch the gateway. Stock is already committed to
 * this order at that point (R5/M3), so a failed or abandoned payment here
 * leaves a real, unpaid order rather than nothing — the checkout screen's
 * existing idempotency key lets the customer safely retry by submitting the
 * same order again, which re-enters this function rather than creating a
 * second order.
 */

export type InitiateOrderPaymentResult =
  | {
      ok: true;
      paymentId: string;
      provider: string;
      gatewayOrderId: string;
      publicKey: string;
      amountPaise: bigint;
      currency: string;
    }
  | { ok: false; reason: 'ORDER_NOT_FOUND' }
  | { ok: false; reason: 'WRONG_PAYMENT_METHOD' }
  | { ok: false; reason: 'ALREADY_PAID' }
  | { ok: false; reason: 'PROVIDER_ERROR'; message: string };

export async function initiateOrderPayment(
  orderId: string,
  userId: string,
): Promise<InitiateOrderPaymentResult> {
  const order = await db.order.findUnique({
    where: { id: orderId },
    select: { id: true, userId: true, totalPaise: true, paymentMethod: true, paymentStatus: true },
  });

  if (!order || order.userId !== userId) return { ok: false, reason: 'ORDER_NOT_FOUND' };
  if (order.paymentMethod !== 'RAZORPAY') return { ok: false, reason: 'WRONG_PAYMENT_METHOD' };
  if (order.paymentStatus === 'PAID') return { ok: false, reason: 'ALREADY_PAID' };

  const provider = getPaymentProvider();
  const paymentId = newId(ID_PREFIX.payment);

  // The row exists BEFORE the gateway is called — same reasoning as the
  // wallet top-up: if `createOrder` succeeds and the process then dies,
  // reconciliation still has something to find.
  await db.payment.create({
    data: {
      id: paymentId,
      userId,
      orderId: order.id,
      gateway: provider.name,
      amountPaise: order.totalPaise,
      status: 'PENDING',
      signatureVerified: false,
    },
  });

  try {
    const gatewayOrder = await provider.createOrder({
      amountPaise: order.totalPaise,
      currency: env.payment.currency,
      referenceId: paymentId,
      userId,
      notes: { purpose: 'order_payment', orderId: order.id },
    });

    await db.payment.update({
      where: { id: paymentId },
      data: { gatewayOrderId: gatewayOrder.gatewayOrderId },
    });

    return {
      ok: true,
      paymentId,
      provider: provider.name,
      gatewayOrderId: gatewayOrder.gatewayOrderId,
      publicKey: gatewayOrder.publicKey,
      amountPaise: gatewayOrder.amountPaise,
      currency: gatewayOrder.currency,
    };
  } catch (error) {
    await db.payment.update({
      where: { id: paymentId },
      data: {
        status: 'FAILED',
        rawPayload: { error: error instanceof Error ? error.message : String(error) },
      },
    });

    return {
      ok: false,
      reason: 'PROVIDER_ERROR',
      message: error instanceof Error ? error.message : 'Could not start the payment',
    };
  }
}

/**
 * What the browser polls after the gateway's callback fires — a READ, same
 * as `getTopupStatus`. `Order.paymentStatus` is authoritative here rather
 * than the individual `Payment` row: the webhook updates both together in
 * one transaction, and reading the order directly also gives the right
 * answer after a retry (a second `Payment` row for the same order) without
 * the client needing to track which `paymentId` was the one that actually
 * landed.
 */
export async function getOrderPaymentStatus(
  orderId: string,
  userId: string,
): Promise<{ status: 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED' } | null> {
  const order = await db.order.findUnique({
    where: { id: orderId },
    select: { userId: true, paymentStatus: true },
  });

  if (!order || order.userId !== userId) return null;
  return { status: order.paymentStatus };
}
