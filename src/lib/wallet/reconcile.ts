import { db } from '@/lib/db';
import { env } from '@/lib/env';
import { getPaymentProvider, type FetchedPayment } from '@/lib/services/payment';
import { LEDGER_REF, credit } from './ledger';

/**
 * P2 — the reconciliation job, plus (session 2026-09-10) the same logic
 * exposed as a single-payment check the status-polling routes can call
 * inline.
 *
 *   "Anything PENDING for over 15 minutes is re-queried against the Razorpay
 *    API and resolved."
 *
 * This is the safety net under the webhook. Webhooks get lost: a deploy
 * restarts the process mid-request, a tunnel drops, the gateway's retry budget
 * runs out. Without this job a customer who genuinely paid sits with no
 * balance and no explanation, which is the single worst failure this system
 * can have.
 *
 * The batch job (`reconcilePendingPayments`) only runs once a day
 * (`vercel.json` — every cron in this project does, the platform's own
 * limit), which is far too slow for someone actively watching the "waiting
 * for your bank" screen. `reconcileOnePayment` is the same lookup-and-
 * resolve logic, callable for exactly one payment — the status routes
 * (`/api/wallet/topup/status`, `/api/orders/:id/pay/status`) call it inline
 * once a payment has been pending long enough that a webhook would normally
 * have already landed, so a lost webhook self-heals within the customer's
 * own poll loop instead of waiting up to 24 hours for the batch job.
 *
 * Both call sites are idempotent by construction — the ledger entry is
 * keyed on the gateway payment id, so a payment resolved here and then by a
 * late webhook (or the batch job, or a second inline call) credits/marks
 * exactly once.
 *
 * `orderId` matters here exactly as it does in the webhook handler
 * (`src/lib/wallet/webhook.ts`): a payment with one set is an order
 * checkout and gets the ORDER marked paid, never the wallet credited. The
 * batch job used to skip this distinction entirely — every payment it
 * resolved as PAID got wallet-credited regardless, which for a stuck ORDER
 * payment would have credited the customer's wallet for money that was
 * never a top-up while leaving the actual order stuck PENDING forever.
 */

export type SinglePaymentOutcome =
  | { outcome: 'credited'; amountPaise: bigint }
  | { outcome: 'already-credited' }
  | { outcome: 'order-paid'; orderId: string }
  | { outcome: 'already-paid' }
  | { outcome: 'failed' }
  | { outcome: 'still-pending' }
  | { outcome: 'not-pending' };

/** Payments still PENDING after this long are given up on entirely. */
const EXPIRE_AFTER_HOURS = 24;

const paymentSelect = {
  id: true,
  userId: true,
  orderId: true,
  amountPaise: true,
  gatewayOrderId: true,
  gatewayPaymentId: true,
  status: true,
  createdAt: true,
} as const;

type PendingPayment = {
  id: string;
  userId: string;
  orderId: string | null;
  amountPaise: bigint;
  gatewayOrderId: string | null;
  gatewayPaymentId: string | null;
};

async function fetchFromGateway(
  provider: ReturnType<typeof getPaymentProvider>,
  payment: PendingPayment,
): Promise<FetchedPayment | null> {
  if (payment.gatewayPaymentId) {
    return provider.fetchPayment(payment.gatewayPaymentId);
  }
  if (!payment.gatewayOrderId) return null;

  // The webhook never arrived, so we know the order but not the payment.
  // This is the case this whole module exists for.
  const candidates = await provider.fetchPaymentsForOrder(payment.gatewayOrderId);
  return (
    candidates.find((candidate) => candidate.status === 'PAID') ??
    candidates.find((candidate) => candidate.status === 'FAILED') ??
    null
  );
}

/** Resolves the gateway's real status for a single PENDING payment — the
    order/wallet branch mirrors `handlePaymentWebhook` exactly, since this
    is the same event arriving late rather than a different kind of event. */
export async function reconcileOnePayment(paymentId: string): Promise<SinglePaymentOutcome> {
  const payment = await db.payment.findUnique({ where: { id: paymentId }, select: paymentSelect });
  if (!payment || payment.status !== 'PENDING') return { outcome: 'not-pending' };

  const provider = getPaymentProvider();
  const fetched = await fetchFromGateway(provider, payment);
  if (!fetched) return { outcome: 'still-pending' };

  if (fetched.status === 'FAILED') {
    await db.payment.update({
      where: { id: payment.id },
      data: { status: 'FAILED', gatewayPaymentId: fetched.gatewayPaymentId || null, rawPayload: fetched.raw as never },
    });
    return { outcome: 'failed' };
  }

  if (fetched.status !== 'PAID') return { outcome: 'still-pending' };

  const amountPaise = fetched.amountPaise > 0n ? fetched.amountPaise : payment.amountPaise;

  if (payment.orderId) {
    const orderId = payment.orderId;
    return db.$transaction(async (tx) => {
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: 'PAID',
          gatewayPaymentId: fetched.gatewayPaymentId || null,
          signatureVerified: false, // came from our own API call, not a signed webhook payload
          rawPayload: fetched.raw as never,
        },
      });

      const result = await tx.order.updateMany({
        where: { id: orderId, paymentStatus: 'PENDING' },
        data: { paymentStatus: 'PAID' },
      });

      return result.count === 0
        ? ({ outcome: 'already-paid' } as const)
        : ({ outcome: 'order-paid', orderId } as const);
    });
  }

  return db.$transaction(async (tx) => {
    await tx.payment.update({
      where: { id: payment.id },
      data: {
        status: 'PAID',
        gatewayPaymentId: fetched.gatewayPaymentId || null,
        signatureVerified: false,
        rawPayload: fetched.raw as never,
      },
    });

    const entry = await credit(
      {
        userId: payment.userId,
        amountPaise,
        source: 'TOPUP',
        ...LEDGER_REF.payment(fetched.gatewayPaymentId || payment.id),
        note: 'Wallet top-up (reconciled)',
      },
      tx,
    );

    return entry.alreadyRecorded
      ? ({ outcome: 'already-credited' } as const)
      : ({ outcome: 'credited', amountPaise } as const);
  });
}

export interface ReconcileResult {
  checked: number;
  credited: number;
  orderPaid: number;
  failed: number;
  expired: number;
  errors: Array<{ paymentId: string; message: string }>;
}

/** The daily batch job — everything still PENDING past the threshold, swept
    in one pass. `reconcileOnePayment` above is the same logic for exactly
    one payment, called inline by the status-polling routes. */
export async function reconcilePendingPayments(now: Date = new Date()): Promise<ReconcileResult> {
  const cutoff = new Date(now.getTime() - env.payment.pendingReconcileMinutes * 60_000);
  const expiryCutoff = new Date(now.getTime() - EXPIRE_AFTER_HOURS * 3_600_000);

  const pending = await db.payment.findMany({
    where: { status: 'PENDING', createdAt: { lt: cutoff } },
    orderBy: { createdAt: 'asc' },
    take: 100,
    select: paymentSelect,
  });

  const result: ReconcileResult = { checked: pending.length, credited: 0, orderPaid: 0, failed: 0, expired: 0, errors: [] };

  for (const payment of pending) {
    try {
      const before = await db.payment.findUnique({ where: { id: payment.id }, select: { status: true } });
      if (before?.status !== 'PENDING') continue; // resolved by a webhook since the query ran

      const resolved = await reconcileOnePayment(payment.id);

      if (resolved.outcome === 'credited') {
        result.credited += 1;
      } else if (resolved.outcome === 'order-paid') {
        result.orderPaid += 1;
      } else if (resolved.outcome === 'failed') {
        result.failed += 1;
      } else if (resolved.outcome === 'still-pending' && payment.createdAt < expiryCutoff) {
        // Genuinely nothing at the gateway (or gateway still processing) for
        // a full day — the customer opened checkout and never went through
        // with it, or the money is simply never coming. Stop asking.
        await db.payment.update({
          where: { id: payment.id },
          data: { status: 'FAILED', rawPayload: { reconciled: 'expired' } },
        });
        result.expired += 1;
      }
    } catch (error) {
      // One unreachable payment must not stop the other ninety-nine.
      result.errors.push({
        paymentId: payment.id,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return result;
}
