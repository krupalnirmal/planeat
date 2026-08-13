import { db } from '@/lib/db';
import { env } from '@/lib/env';
import { ID_PREFIX, newId } from '@/lib/ids';
import { getPaymentProvider } from '@/lib/services/payment';

/**
 * Wallet top-up, first half (M7).
 *
 * This function takes money nowhere near the wallet. It records an intent and
 * hands the browser what it needs to open the gateway's checkout. The wallet is
 * credited only by a signature-verified webhook (P2) — see `webhook.ts`.
 *
 * P5 — nothing Razorpay-shaped leaves this file. The response speaks in
 * `gatewayOrderId` / `publicKey`, so swapping to Cashfree is a provider change,
 * not a UI change.
 */

export interface InitiateTopupInput {
  userId: string;
  amountPaise: bigint;
}

export type InitiateTopupResult =
  | {
      ok: true;
      paymentId: string;
      provider: string;
      gatewayOrderId: string;
      publicKey: string;
      amountPaise: bigint;
      currency: string;
    }
  | { ok: false; reason: 'BELOW_MINIMUM'; minimumPaise: bigint }
  | { ok: false; reason: 'PROVIDER_ERROR'; message: string };

export async function initiateTopup(input: InitiateTopupInput): Promise<InitiateTopupResult> {
  const minimumPaise = env.payment.minTopupPaise;

  if (input.amountPaise < minimumPaise) {
    return { ok: false, reason: 'BELOW_MINIMUM', minimumPaise };
  }

  const provider = getPaymentProvider();
  const paymentId = newId(ID_PREFIX.payment);

  // The row exists BEFORE the gateway is called. If `createOrder` succeeds and
  // the process then dies, reconciliation still has something to find; the
  // other way round leaves money at the gateway that we have no record of.
  await db.payment.create({
    data: {
      id: paymentId,
      userId: input.userId,
      gateway: provider.name,
      amountPaise: input.amountPaise,
      status: 'PENDING',
      signatureVerified: false,
    },
  });

  try {
    const order = await provider.createOrder({
      amountPaise: input.amountPaise,
      currency: env.payment.currency,
      referenceId: paymentId,
      userId: input.userId,
      notes: { purpose: 'wallet_topup' },
    });

    await db.payment.update({
      where: { id: paymentId },
      data: { gatewayOrderId: order.gatewayOrderId },
    });

    return {
      ok: true,
      paymentId,
      provider: provider.name,
      gatewayOrderId: order.gatewayOrderId,
      publicKey: order.publicKey,
      amountPaise: order.amountPaise,
      currency: order.currency,
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

/** Quick top-up chips: ₹200 / ₹500 / ₹1,000 / custom (M7). */
export function topupPresets(): bigint[] {
  return [...env.payment.topupPresetsPaise];
}

export function minimumTopupPaise(): bigint {
  return env.payment.minTopupPaise;
}
