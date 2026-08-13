import { db } from '@/lib/db';
import { env } from '@/lib/env';
import { getPaymentProvider, type FetchedPayment } from '@/lib/services/payment';
import { LEDGER_REF, credit } from './ledger';

/**
 * P2 — the reconciliation job.
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
 * It is idempotent by construction — the ledger entry is keyed on the gateway
 * payment id, so a payment resolved here and then by a late webhook credits
 * exactly once.
 */

export interface ReconcileResult {
  checked: number;
  credited: number;
  failed: number;
  expired: number;
  errors: Array<{ paymentId: string; message: string }>;
}

/** Payments still PENDING after this long are given up on entirely. */
const EXPIRE_AFTER_HOURS = 24;

export async function reconcilePendingPayments(now: Date = new Date()): Promise<ReconcileResult> {
  const provider = getPaymentProvider();
  const cutoff = new Date(now.getTime() - env.payment.pendingReconcileMinutes * 60_000);
  const expiryCutoff = new Date(now.getTime() - EXPIRE_AFTER_HOURS * 3_600_000);

  const pending = await db.payment.findMany({
    where: { status: 'PENDING', createdAt: { lt: cutoff } },
    orderBy: { createdAt: 'asc' },
    take: 100,
    select: {
      id: true,
      userId: true,
      amountPaise: true,
      gatewayOrderId: true,
      gatewayPaymentId: true,
      createdAt: true,
    },
  });

  const result: ReconcileResult = {
    checked: pending.length,
    credited: 0,
    failed: 0,
    expired: 0,
    errors: [],
  };

  for (const payment of pending) {
    try {
      let fetched: FetchedPayment | null = null;

      if (payment.gatewayPaymentId) {
        fetched = await provider.fetchPayment(payment.gatewayPaymentId);
      } else if (payment.gatewayOrderId) {
        // The webhook never arrived, so we know the order but not the payment.
        // This is the case the job exists for.
        const candidates = await provider.fetchPaymentsForOrder(payment.gatewayOrderId);
        fetched =
          candidates.find((candidate) => candidate.status === 'PAID') ??
          candidates.find((candidate) => candidate.status === 'FAILED') ??
          null;
      }

      if (!fetched) {
        // Nothing at the gateway at all. The customer opened checkout and never
        // went through with it; after a day, stop asking.
        if (payment.createdAt < expiryCutoff) {
          await db.payment.update({
            where: { id: payment.id },
            data: { status: 'FAILED', rawPayload: { reconciled: 'expired' } },
          });
          result.expired += 1;
        }
        continue;
      }

      if (fetched.status === 'PAID') {
        const amountPaise = fetched.amountPaise > 0n ? fetched.amountPaise : payment.amountPaise;

        await db.$transaction(async (tx) => {
          await tx.payment.update({
            where: { id: payment.id },
            data: {
              status: 'PAID',
              gatewayPaymentId: fetched.gatewayPaymentId || null,
              // Not signature-verified: this came from an authenticated API
              // call we made, not from a signed payload they sent us. The
              // distinction matters in a dispute.
              signatureVerified: false,
              rawPayload: fetched.raw as never,
            },
          });

          await credit(
            {
              userId: payment.userId,
              amountPaise,
              source: 'TOPUP',
              ...LEDGER_REF.payment(fetched.gatewayPaymentId || payment.id),
              note: 'Wallet top-up (reconciled)',
            },
            tx,
          );
        });

        result.credited += 1;
        continue;
      }

      if (fetched.status === 'FAILED') {
        await db.payment.update({
          where: { id: payment.id },
          data: {
            status: 'FAILED',
            gatewayPaymentId: fetched.gatewayPaymentId || null,
            rawPayload: fetched.raw as never,
          },
        });
        result.failed += 1;
        continue;
      }

      // Still genuinely pending at the gateway — leave it for the next run,
      // unless it has been pending for a day.
      if (payment.createdAt < expiryCutoff) {
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
