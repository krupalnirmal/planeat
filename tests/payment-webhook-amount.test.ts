import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `handlePaymentWebhook`'s order-payment amount check (session 2026-09-30,
 * payment-security review) — mocked against `db`, same pattern as
 * `subscription-manage.test.ts`. `payment-webhook.test.ts` already covers
 * the provider-level signature verification (the attack that matters most:
 * keep the signature, change the amount — rejected there, before this code
 * even runs); this file covers the defense-in-depth check on the other
 * side of that boundary, for the rare case a genuinely signature-valid
 * event ever reports a captured amount short of what the order is worth.
 */

const dbMock = vi.hoisted(() => ({
  payment: { findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
  order: { updateMany: vi.fn(), findUnique: vi.fn() },
  auditLog: { create: vi.fn() },
  $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(dbMock)),
}));

vi.mock('@/lib/db', () => ({ db: dbMock }));
vi.mock('./ledger', () => ({ credit: vi.fn(), LEDGER_REF: { payment: () => ({}) } }));
vi.mock('@/lib/notifications/notify-now', () => ({ notifyEventNow: vi.fn() }));

import { handlePaymentWebhook } from '@/lib/wallet/webhook';
import { TEMPLATE } from '@/lib/notifications/notify';
import type { WebhookEvent } from '@/lib/services/payment';

const PAYMENT_ROW = {
  id: 'pay_1',
  userId: 'usr_1',
  orderId: 'ord_1',
  amountPaise: 10_000n,
  status: 'PENDING' as const,
};

function capturedEvent(amountPaise: bigint): WebhookEvent {
  return {
    type: 'payment.captured',
    gatewayPaymentId: 'pay_gw_1',
    gatewayOrderId: 'order_gw_1',
    amountPaise,
    currency: 'INR',
    referenceId: 'pay_1',
    raw: {},
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  dbMock.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(dbMock));
  dbMock.payment.findUnique.mockResolvedValue(PAYMENT_ROW);
  dbMock.order.updateMany.mockResolvedValue({ count: 1 });
  dbMock.order.findUnique.mockResolvedValue({ orderNumber: 'AC-260930-TEST01' });
});

describe('handlePaymentWebhook — order-payment amount check', () => {
  it('marks the order paid when the captured amount matches exactly, and confirms the customer', async () => {
    const result = await handlePaymentWebhook(capturedEvent(10_000n));

    expect(result).toEqual({ handled: true, action: 'ORDER_PAID', paymentId: 'pay_1', orderId: 'ord_1' });
    expect(dbMock.order.updateMany).toHaveBeenCalledWith({
      where: { id: 'ord_1', paymentStatus: 'PENDING' },
      data: { paymentStatus: 'PAID' },
    });

    const { notifyEventNow } = await import('@/lib/notifications/notify-now');
    expect(notifyEventNow).toHaveBeenCalledWith(
      'usr_1',
      TEMPLATE.orderPlaced,
      expect.objectContaining({ orderId: 'ord_1', orderNumber: 'AC-260930-TEST01' }),
    );
  });

  it('does not re-confirm a replayed webhook for an already-paid order', async () => {
    dbMock.order.updateMany.mockResolvedValue({ count: 0 }); // already PAID, nothing to flip

    const result = await handlePaymentWebhook(capturedEvent(10_000n));

    expect(result).toEqual({ handled: true, action: 'ALREADY_PAID', paymentId: 'pay_1' });

    const { notifyEventNow } = await import('@/lib/notifications/notify-now');
    expect(notifyEventNow).not.toHaveBeenCalled();
  });

  it('refuses to mark the order paid when the gateway captured less than the order is worth', async () => {
    const result = await handlePaymentWebhook(capturedEvent(6_000n));

    expect(result).toEqual({
      handled: true,
      action: 'AMOUNT_MISMATCH',
      paymentId: 'pay_1',
      orderId: 'ord_1',
    });
    // The order's own paid status is never touched.
    expect(dbMock.order.updateMany).not.toHaveBeenCalled();
    // But the shortfall is recorded for someone to actually look at.
    expect(dbMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'webhook.amount_mismatch', entityId: 'ord_1' }),
      }),
    );
  });

  it('still marks the order paid when the gateway captured MORE than expected', async () => {
    // The customer overpaying is not a shortfall the store needs to
    // withhold delivery over — same "credit what the gateway reports"
    // reasoning the wallet top-up side of this file already documents.
    const result = await handlePaymentWebhook(capturedEvent(12_000n));

    expect(result).toEqual({ handled: true, action: 'ORDER_PAID', paymentId: 'pay_1', orderId: 'ord_1' });
  });
});
