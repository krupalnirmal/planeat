import { env } from '@/lib/env';
import type {
  CreateOrderOptions,
  CreatedOrder,
  FetchedPayment,
  PaymentProvider,
  PaymentState,
  RefundOptions,
  RefundResult,
  VerifyWebhookOptions,
  WebhookEvent,
} from '../types';
import { PaymentProviderError } from '../types';

/**
 * Razorpay over plain REST — no vendor SDK (R1, R11).
 *
 * P2 — `verifyWebhook` HMAC-verifies against RAZORPAY_WEBHOOK_SECRET and
 * returns null on any mismatch. The caller must reject with 400 and log it.
 * Nothing here credits a wallet; that is the route's job, idempotent on
 * `gateway_payment_id`.
 */

const BASE_URL = 'https://api.razorpay.com/v1';

interface RazorpayOrder {
  id?: string;
  amount?: number;
  currency?: string;
  error?: { description?: string };
}

interface RazorpayPayment {
  id?: string;
  order_id?: string;
  amount?: number;
  currency?: string;
  status?: string;
  method?: string;
  notes?: Record<string, string>;
  error?: { description?: string };
}

interface RazorpayRefund {
  id?: string;
  amount?: number;
  status?: string;
  error?: { description?: string };
}

interface RazorpayWebhookBody {
  event?: string;
  payload?: {
    payment?: { entity?: RazorpayPayment };
    refund?: { entity?: RazorpayRefund & { payment_id?: string } };
  };
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

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function toPaymentState(status: string | undefined): PaymentState {
  switch (status) {
    case 'captured':
      return 'PAID';
    case 'failed':
      return 'FAILED';
    case 'refunded':
      return 'REFUNDED';
    default:
      return 'PENDING';
  }
}

export class RazorpayProvider implements PaymentProvider {
  readonly name = 'razorpay';

  constructor(
    private readonly keyId: string = env.payment.razorpayKeyId,
    private readonly keySecret: string = env.payment.razorpayKeySecret,
    private readonly webhookSecret: string = env.payment.razorpayWebhookSecret,
  ) {}

  private authHeader(): string {
    if (!this.keyId || !this.keySecret) {
      throw new PaymentProviderError('RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET are not set.');
    }
    const encoded = Buffer.from(`${this.keyId}:${this.keySecret}`).toString('base64');
    return `Basic ${encoded}`;
  }

  async createOrder(opts: CreateOrderOptions): Promise<CreatedOrder> {
    if (opts.amountPaise <= 0n) {
      throw new PaymentProviderError('Amount must be greater than zero.');
    }

    const res = await fetch(`${BASE_URL}/orders`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: this.authHeader() },
      body: JSON.stringify({
        amount: Number(opts.amountPaise),
        currency: opts.currency,
        receipt: opts.referenceId,
        notes: { ...opts.notes, userId: opts.userId, referenceId: opts.referenceId },
      }),
    });

    const json = (await res.json()) as RazorpayOrder;

    if (!res.ok || !json.id) {
      throw new PaymentProviderError(
        json.error?.description ?? `Razorpay createOrder failed with status ${res.status}`,
      );
    }

    return {
      gatewayOrderId: json.id,
      amountPaise: BigInt(json.amount ?? Number(opts.amountPaise)),
      currency: json.currency ?? opts.currency,
      publicKey: this.keyId,
    };
  }

  async verifyWebhook(opts: VerifyWebhookOptions): Promise<WebhookEvent | null> {
    if (!this.webhookSecret) {
      throw new PaymentProviderError('RAZORPAY_WEBHOOK_SECRET is not set.');
    }

    const expected = await hmacSha256Hex(this.webhookSecret, opts.rawBody);
    if (!safeEqual(expected, opts.signature)) return null;

    let body: RazorpayWebhookBody;
    try {
      body = JSON.parse(opts.rawBody) as RazorpayWebhookBody;
    } catch {
      return null;
    }

    const payment = body.payload?.payment?.entity;
    const refund = body.payload?.refund?.entity;

    const type: WebhookEvent['type'] =
      body.event === 'payment.captured'
        ? 'payment.captured'
        : body.event === 'payment.failed'
          ? 'payment.failed'
          : body.event === 'refund.processed'
            ? 'refund.processed'
            : 'unknown';

    return {
      type,
      gatewayPaymentId: payment?.id ?? refund?.payment_id ?? '',
      gatewayOrderId: payment?.order_id ?? '',
      amountPaise: BigInt(payment?.amount ?? refund?.amount ?? 0),
      currency: payment?.currency ?? 'INR',
      referenceId: payment?.notes?.referenceId ?? null,
      raw: body,
    };
  }

  async refund(opts: RefundOptions): Promise<RefundResult> {
    const res = await fetch(`${BASE_URL}/payments/${opts.gatewayPaymentId}/refund`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: this.authHeader() },
      body: JSON.stringify({
        amount: Number(opts.amountPaise),
        notes: opts.reason ? { reason: opts.reason } : undefined,
      }),
    });

    const json = (await res.json()) as RazorpayRefund;

    if (!res.ok || !json.id) {
      throw new PaymentProviderError(
        json.error?.description ?? `Razorpay refund failed with status ${res.status}`,
      );
    }

    return {
      gatewayRefundId: json.id,
      amountPaise: BigInt(json.amount ?? Number(opts.amountPaise)),
      status: json.status === 'processed' ? 'PROCESSED' : 'PENDING',
    };
  }

  async fetchPayment(gatewayPaymentId: string): Promise<FetchedPayment> {
    const res = await fetch(`${BASE_URL}/payments/${gatewayPaymentId}`, {
      headers: { authorization: this.authHeader() },
    });

    const json = (await res.json()) as RazorpayPayment;

    if (!res.ok || !json.id) {
      throw new PaymentProviderError(
        json.error?.description ?? `Razorpay fetchPayment failed with status ${res.status}`,
      );
    }

    return toFetchedPayment(json);
  }

  async fetchPaymentsForOrder(gatewayOrderId: string): Promise<FetchedPayment[]> {
    const res = await fetch(`${BASE_URL}/orders/${gatewayOrderId}/payments`, {
      headers: { authorization: this.authHeader() },
    });

    const json = (await res.json()) as { items?: RazorpayPayment[] } & { error?: { description?: string } };

    if (!res.ok) {
      throw new PaymentProviderError(
        json.error?.description ??
          `Razorpay fetchPaymentsForOrder failed with status ${res.status}`,
      );
    }

    return (json.items ?? []).filter((item) => item.id).map(toFetchedPayment);
  }
}

function toFetchedPayment(payment: RazorpayPayment): FetchedPayment {
  return {
    gatewayPaymentId: payment.id ?? '',
    gatewayOrderId: payment.order_id ?? '',
    amountPaise: BigInt(payment.amount ?? 0),
    status: toPaymentState(payment.status),
    method: payment.method ?? null,
    raw: payment,
  };
}
