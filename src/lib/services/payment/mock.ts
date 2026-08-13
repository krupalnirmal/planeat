import type {
  CreateOrderOptions,
  CreatedOrder,
  FetchedPayment,
  PaymentProvider,
  RefundOptions,
  RefundResult,
  VerifyWebhookOptions,
  WebhookEvent,
} from './types';
import { PaymentProviderError } from './types';

/**
 * R2 — the payment mock, written before Razorpay.
 *
 * It models the part that actually matters: the webhook is the source of truth
 * (P2). `createOrder` does not credit anything. Nothing moves until a signed
 * webhook is verified, exactly as in production. `simulateCapture()` produces
 * a correctly signed payload so tests can exercise the real webhook route,
 * including replaying the same payload ten times.
 */

const MOCK_SECRET = 'mock_webhook_secret';

interface MockPaymentRecord {
  gatewayOrderId: string;
  gatewayPaymentId: string;
  amountPaise: bigint;
  referenceId: string;
  status: 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED';
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return [...new Uint8Array(signature)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Constant-time comparison — a timing oracle on a signature check is a real bug. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export class MockPaymentProvider implements PaymentProvider {
  readonly name = 'mock';

  private payments = new Map<string, MockPaymentRecord>();
  private counter = 0;

  async createOrder(opts: CreateOrderOptions): Promise<CreatedOrder> {
    if (opts.amountPaise <= 0n) {
      throw new PaymentProviderError('Amount must be greater than zero.');
    }
    this.counter += 1;
    const gatewayOrderId = `mock_order_${this.counter}`;
    const gatewayPaymentId = `mock_pay_${this.counter}`;

    this.payments.set(gatewayPaymentId, {
      gatewayOrderId,
      gatewayPaymentId,
      amountPaise: opts.amountPaise,
      referenceId: opts.referenceId,
      status: 'PENDING',
    });

    return {
      gatewayOrderId,
      amountPaise: opts.amountPaise,
      currency: opts.currency,
      publicKey: 'mock_key_id',
    };
  }

  async verifyWebhook(opts: VerifyWebhookOptions): Promise<WebhookEvent | null> {
    const expected = await hmacSha256Hex(MOCK_SECRET, opts.rawBody);
    if (!safeEqual(expected, opts.signature)) return null;

    let payload: {
      event?: string;
      payment?: {
        id?: string;
        order_id?: string;
        amount?: number;
        currency?: string;
        reference_id?: string;
      };
    };
    try {
      payload = JSON.parse(opts.rawBody);
    } catch {
      return null;
    }

    const payment = payload.payment ?? {};
    const type =
      payload.event === 'payment.captured'
        ? 'payment.captured'
        : payload.event === 'payment.failed'
          ? 'payment.failed'
          : payload.event === 'refund.processed'
            ? 'refund.processed'
            : 'unknown';

    const record = payment.id ? this.payments.get(payment.id) : undefined;
    if (record && type === 'payment.captured') record.status = 'PAID';
    if (record && type === 'payment.failed') record.status = 'FAILED';

    return {
      type,
      gatewayPaymentId: payment.id ?? '',
      gatewayOrderId: payment.order_id ?? '',
      amountPaise: BigInt(payment.amount ?? 0),
      currency: payment.currency ?? 'INR',
      referenceId: payment.reference_id ?? record?.referenceId ?? null,
      raw: payload,
    };
  }

  async refund(opts: RefundOptions): Promise<RefundResult> {
    const record = this.payments.get(opts.gatewayPaymentId);
    if (!record) throw new PaymentProviderError(`Unknown payment ${opts.gatewayPaymentId}`);
    record.status = 'REFUNDED';
    this.counter += 1;
    return {
      gatewayRefundId: `mock_rfnd_${this.counter}`,
      amountPaise: opts.amountPaise,
      status: 'PROCESSED',
    };
  }

  async fetchPayment(gatewayPaymentId: string): Promise<FetchedPayment> {
    const record = this.payments.get(gatewayPaymentId);
    if (!record) throw new PaymentProviderError(`Unknown payment ${gatewayPaymentId}`);
    return this.toFetched(record);
  }

  async fetchPaymentsForOrder(gatewayOrderId: string): Promise<FetchedPayment[]> {
    return [...this.payments.values()]
      .filter((record) => record.gatewayOrderId === gatewayOrderId)
      .map((record) => this.toFetched(record));
  }

  private toFetched(record: MockPaymentRecord): FetchedPayment {
    return {
      gatewayPaymentId: record.gatewayPaymentId,
      gatewayOrderId: record.gatewayOrderId,
      amountPaise: record.amountPaise,
      status: record.status,
      method: 'upi',
      raw: record,
    };
  }

  /**
   * Marks a mock payment captured WITHOUT going through the webhook, so a test
   * can reproduce the case the reconciliation job exists for: the customer
   * paid, the webhook never arrived, and our side is still PENDING.
   */
  markCapturedSilently(gatewayOrderId: string): void {
    for (const record of this.payments.values()) {
      if (record.gatewayOrderId === gatewayOrderId) record.status = 'PAID';
    }
  }

  // ── Test helpers ──────────────────────────────────────────

  /** Builds a correctly signed webhook payload for a created order. */
  async simulateCapture(gatewayOrderId: string): Promise<{ rawBody: string; signature: string }> {
    const record = [...this.payments.values()].find((p) => p.gatewayOrderId === gatewayOrderId);
    if (!record) throw new PaymentProviderError(`Unknown order ${gatewayOrderId}`);

    const rawBody = JSON.stringify({
      event: 'payment.captured',
      payment: {
        id: record.gatewayPaymentId,
        order_id: record.gatewayOrderId,
        amount: Number(record.amountPaise),
        currency: 'INR',
        reference_id: record.referenceId,
      },
    });

    return { rawBody, signature: await hmacSha256Hex(MOCK_SECRET, rawBody) };
  }

  clear(): void {
    this.payments.clear();
    this.counter = 0;
  }
}
