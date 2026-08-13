/**
 * The payment port.
 *
 * P5 — the interface stays generic: `createOrder`, `verifyWebhook`, `refund`,
 * `fetchPayment`. No Razorpay-shaped field name may leak into application
 * code, so Cashfree or PhonePe PG can replace it without touching a route.
 */

export type PaymentState = 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED';

export interface CreateOrderOptions {
  amountPaise: bigint;
  currency: string;
  /** Our own reference, echoed back on the webhook. */
  referenceId: string;
  userId: string;
  notes?: Record<string, string>;
}

export interface CreatedOrder {
  /** Gateway-side order id, handed to the browser checkout widget. */
  gatewayOrderId: string;
  amountPaise: bigint;
  currency: string;
  /** Public key the browser needs to open checkout. Never the secret. */
  publicKey: string;
}

export interface VerifyWebhookOptions {
  /** Raw request body EXACTLY as received — re-serialising breaks the HMAC. */
  rawBody: string;
  signature: string;
}

export interface WebhookEvent {
  /** Normalised across gateways. */
  type: 'payment.captured' | 'payment.failed' | 'refund.processed' | 'unknown';
  gatewayPaymentId: string;
  gatewayOrderId: string;
  amountPaise: bigint;
  currency: string;
  referenceId: string | null;
  /** Full untouched payload — stored in `payments.raw_payload`. */
  raw: unknown;
}

export interface RefundOptions {
  gatewayPaymentId: string;
  amountPaise: bigint;
  reason?: string;
}

export interface RefundResult {
  gatewayRefundId: string;
  amountPaise: bigint;
  status: 'PENDING' | 'PROCESSED' | 'FAILED';
}

export interface FetchedPayment {
  gatewayPaymentId: string;
  gatewayOrderId: string;
  amountPaise: bigint;
  status: PaymentState;
  method: string | null;
  raw: unknown;
}

export interface PaymentProvider {
  readonly name: string;

  createOrder(opts: CreateOrderOptions): Promise<CreatedOrder>;

  /**
   * P2 — returns null when the signature does not verify. Callers must treat
   * null as a 400 and log it; they must never fall back to trusting the body.
   */
  verifyWebhook(opts: VerifyWebhookOptions): Promise<WebhookEvent | null>;

  refund(opts: RefundOptions): Promise<RefundResult>;

  /** Used by the reconciliation job for anything PENDING over 15 minutes. */
  fetchPayment(gatewayPaymentId: string): Promise<FetchedPayment>;

  /**
   * P2 reconciliation, second case: the webhook never arrived, so we know the
   * order id but not the payment id. Without this the job cannot resolve the
   * exact failure it exists for — the customer paid, the callback never fired,
   * and nothing on our side knows the payment id to ask about.
   */
  fetchPaymentsForOrder(gatewayOrderId: string): Promise<FetchedPayment[]>;
}

export class PaymentProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PaymentProviderError';
  }
}
