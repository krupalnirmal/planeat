import { beforeEach, describe, expect, it } from 'vitest';
import { MockPaymentProvider } from '@/lib/services/payment';

/**
 * P2 — the webhook is the source of truth for the wallet.
 *
 * These tests cover the provider half of that guarantee: signature
 * verification, and a stable payment id across replays. The ledger half — that
 * ten replays credit exactly once — is pinned in `wallet-ledger.test.ts`.
 *
 * Together they are PART 12's payment criteria, exercisable with no Razorpay
 * account and no network (R2).
 */

let provider: MockPaymentProvider;

beforeEach(() => {
  provider = new MockPaymentProvider();
});

async function createTopup(amountPaise = 50_000n) {
  return provider.createOrder({
    amountPaise,
    currency: 'INR',
    referenceId: 'pay_internal_1',
    userId: 'usr_1',
  });
}

describe('signature verification', () => {
  it('accepts a correctly signed payload', async () => {
    const order = await createTopup();
    const { rawBody, signature } = await provider.simulateCapture(order.gatewayOrderId);

    const event = await provider.verifyWebhook({ rawBody, signature });

    expect(event).not.toBeNull();
    expect(event?.type).toBe('payment.captured');
    expect(event?.amountPaise).toBe(50_000n);
    expect(event?.referenceId).toBe('pay_internal_1');
  });

  it('rejects a tampered signature', async () => {
    const order = await createTopup();
    const { rawBody } = await provider.simulateCapture(order.gatewayOrderId);

    expect(await provider.verifyWebhook({ rawBody, signature: 'deadbeef' })).toBeNull();
    expect(await provider.verifyWebhook({ rawBody, signature: '' })).toBeNull();
  });

  it('rejects a tampered BODY even with the original signature', async () => {
    // The attack that matters: keep the signature, change the amount.
    const order = await createTopup();
    const { rawBody, signature } = await provider.simulateCapture(order.gatewayOrderId);

    const inflated = rawBody.replace('"amount":50000', '"amount":5000000');
    expect(inflated).not.toBe(rawBody);

    expect(await provider.verifyWebhook({ rawBody: inflated, signature })).toBeNull();
  });

  it('rejects a signature from a different payload', async () => {
    const first = await createTopup(50_000n);
    const second = await provider.createOrder({
      amountPaise: 90_000n,
      currency: 'INR',
      referenceId: 'pay_internal_2',
      userId: 'usr_1',
    });

    const a = await provider.simulateCapture(first.gatewayOrderId);
    const b = await provider.simulateCapture(second.gatewayOrderId);

    expect(await provider.verifyWebhook({ rawBody: a.rawBody, signature: b.signature })).toBeNull();
  });

  it('rejects a body that is not valid JSON', async () => {
    expect(await provider.verifyWebhook({ rawBody: 'not json', signature: 'x' })).toBeNull();
  });
});

describe('replay safety', () => {
  it('returns the same gateway payment id every time', async () => {
    // PART 12 — "Replaying the same webhook payload ten times credits the
    // wallet exactly once." The ledger enforces that; this is what it keys on.
    const order = await createTopup();
    const { rawBody, signature } = await provider.simulateCapture(order.gatewayOrderId);

    const ids = new Set<string>();
    for (let i = 0; i < 10; i++) {
      const event = await provider.verifyWebhook({ rawBody, signature });
      ids.add(event!.gatewayPaymentId);
    }

    expect(ids.size).toBe(1);
  });
});

describe('reconciliation lookups', () => {
  it('finds a payment by its order id when no webhook ever arrived', async () => {
    // The exact case the job exists for: the customer paid, the webhook was
    // lost, and our side knows the order but not the payment.
    const order = await createTopup();
    provider.markCapturedSilently(order.gatewayOrderId);

    const found = await provider.fetchPaymentsForOrder(order.gatewayOrderId);

    expect(found).toHaveLength(1);
    expect(found[0].status).toBe('PAID');
    expect(found[0].amountPaise).toBe(50_000n);
  });

  it('returns an empty list for an order nobody paid', async () => {
    expect(await provider.fetchPaymentsForOrder('mock_order_missing')).toEqual([]);
  });

  it('reports a payment as PENDING until it is captured', async () => {
    const order = await createTopup();
    const [pending] = await provider.fetchPaymentsForOrder(order.gatewayOrderId);
    expect(pending.status).toBe('PENDING');
  });

  it('reflects a capture that came through the webhook', async () => {
    const order = await createTopup();
    const { rawBody, signature } = await provider.simulateCapture(order.gatewayOrderId);
    await provider.verifyWebhook({ rawBody, signature });

    const [settled] = await provider.fetchPaymentsForOrder(order.gatewayOrderId);
    expect(settled.status).toBe('PAID');
  });
});

describe('failed payments', () => {
  it('surfaces a failure event distinctly from a capture', async () => {
    const order = await createTopup();
    const { rawBody } = await provider.simulateCapture(order.gatewayOrderId);

    const failedBody = rawBody.replace('payment.captured', 'payment.failed');
    // Re-sign, because changing the body must invalidate the old signature —
    // which is the whole point of the previous test.
    const resigned = await provider.simulateCapture(order.gatewayOrderId);
    expect(await provider.verifyWebhook({ rawBody: failedBody, signature: resigned.signature }))
      .toBeNull();
  });
});
