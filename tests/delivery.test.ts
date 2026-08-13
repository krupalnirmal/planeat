import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Phase 9's own pure and DB-mocked logic: the rider status machine (the OTP
 * check is the one place a wrong answer means a stranger accepted someone
 * else's groceries), the notification renderer, the M8 channel table, the
 * daily COD summary, and delivery-partner creation.
 */

const dbMock = vi.hoisted(() => ({
  deliveryAssignment: { findFirst: vi.fn(), findMany: vi.fn(), groupBy: vi.fn(), updateMany: vi.fn() },
  order: { updateMany: vi.fn() },
  orderStatusHistory: { create: vi.fn() },
  notification: { create: vi.fn() },
  user: { findUnique: vi.fn(), create: vi.fn() },
  deliveryPartner: { create: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
  serviceArea: { findUnique: vi.fn() },
  auditLog: { create: vi.fn() },
  $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(dbMock)),
}));

vi.mock('@/lib/db', () => ({ db: dbMock }));

import {
  createDeliveryPartner,
  listDeliveryPartners,
} from '@/lib/admin/delivery-partners';
import { CHANNELS_BY_TEMPLATE, TEMPLATE } from '@/lib/notifications/notify';
import { renderNotification } from '@/lib/notifications/render';
import { advanceAssignment } from '@/lib/delivery/status';
import { getDailySummary } from '@/lib/delivery/queries';

function baseAssignment(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'das_1',
    status: 'ASSIGNED',
    deliveryOtp: '4821',
    order: {
      id: 'ord_1',
      userId: 'usr_customer',
      orderNumber: 'AC-260812-AAAAAA',
      status: 'PACKED',
    },
    ...overrides,
  };
}

describe('rider status machine (advanceAssignment)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMock.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(dbMock));
    dbMock.deliveryAssignment.findMany.mockResolvedValue([]);
    dbMock.order.updateMany.mockResolvedValue({ count: 1 });
    dbMock.deliveryAssignment.updateMany.mockResolvedValue({ count: 1 });
  });

  it('refuses a step that skips the sequence', async () => {
    dbMock.deliveryAssignment.findFirst.mockResolvedValue(baseAssignment());

    const result = await advanceAssignment({
      orderId: 'ord_1',
      partnerId: 'dpt_1',
      to: 'DELIVERED',
    });

    expect(result).toEqual({ ok: false, reason: 'ILLEGAL_TRANSITION' });
  });

  it('refuses pickup when the order was never marked PACKED', async () => {
    dbMock.deliveryAssignment.findFirst.mockResolvedValue(
      baseAssignment({ order: { id: 'ord_1', userId: 'usr_customer', orderNumber: 'AC-1', status: 'PLACED' } }),
    );

    const result = await advanceAssignment({ orderId: 'ord_1', partnerId: 'dpt_1', to: 'PICKED_UP' });

    expect(result).toEqual({ ok: false, reason: 'ORDER_NOT_READY' });
  });

  it('moves PACKED to OUT_FOR_DELIVERY on pickup, and records the history', async () => {
    dbMock.deliveryAssignment.findFirst.mockResolvedValue(baseAssignment());

    const result = await advanceAssignment({ orderId: 'ord_1', partnerId: 'dpt_1', to: 'PICKED_UP' });

    expect(result).toEqual({ ok: true });
    expect(dbMock.order.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'ord_1', status: 'PACKED' },
        data: expect.objectContaining({ status: 'OUT_FOR_DELIVERY' }),
      }),
    );
    expect(dbMock.orderStatusHistory.create).toHaveBeenCalled();
    // M8 — "Order status changes" notifies push + in-app.
    expect(dbMock.notification.create).toHaveBeenCalled();
  });

  it('rejects the wrong OTP', async () => {
    dbMock.deliveryAssignment.findFirst.mockResolvedValue(
      baseAssignment({ status: 'OUT_FOR_DELIVERY', order: { id: 'ord_1', userId: 'u', orderNumber: 'AC-1', status: 'OUT_FOR_DELIVERY' } }),
    );

    const result = await advanceAssignment({
      orderId: 'ord_1',
      partnerId: 'dpt_1',
      to: 'DELIVERED',
      otp: '0000',
    });

    expect(result).toEqual({ ok: false, reason: 'WRONG_OTP' });
    expect(dbMock.order.updateMany).not.toHaveBeenCalled();
  });

  it('accepts the correct OTP', async () => {
    dbMock.deliveryAssignment.findFirst.mockResolvedValue(
      baseAssignment({ status: 'OUT_FOR_DELIVERY', order: { id: 'ord_1', userId: 'u', orderNumber: 'AC-1', status: 'OUT_FOR_DELIVERY' } }),
    );

    const result = await advanceAssignment({
      orderId: 'ord_1',
      partnerId: 'dpt_1',
      to: 'DELIVERED',
      otp: '4821',
    });

    expect(result).toEqual({ ok: true });
  });

  it('accepts a proof photo with no OTP at all', async () => {
    dbMock.deliveryAssignment.findFirst.mockResolvedValue(
      baseAssignment({ status: 'OUT_FOR_DELIVERY', order: { id: 'ord_1', userId: 'u', orderNumber: 'AC-1', status: 'OUT_FOR_DELIVERY' } }),
    );

    const result = await advanceAssignment({
      orderId: 'ord_1',
      partnerId: 'dpt_1',
      to: 'DELIVERED',
      proofImageUrl: 'https://example.com/proof.jpg',
    });

    expect(result).toEqual({ ok: true });
  });

  it('refuses delivery with neither an OTP nor a photo', async () => {
    dbMock.deliveryAssignment.findFirst.mockResolvedValue(
      baseAssignment({ status: 'OUT_FOR_DELIVERY', order: { id: 'ord_1', userId: 'u', orderNumber: 'AC-1', status: 'OUT_FOR_DELIVERY' } }),
    );

    const result = await advanceAssignment({ orderId: 'ord_1', partnerId: 'dpt_1', to: 'DELIVERED' });

    expect(result).toEqual({ ok: false, reason: 'PROOF_REQUIRED' });
  });

  it('requires a reason to mark a delivery failed', async () => {
    dbMock.deliveryAssignment.findFirst.mockResolvedValue(
      baseAssignment({ status: 'OUT_FOR_DELIVERY', order: { id: 'ord_1', userId: 'u', orderNumber: 'AC-1', status: 'OUT_FOR_DELIVERY' } }),
    );

    const result = await advanceAssignment({ orderId: 'ord_1', partnerId: 'dpt_1', to: 'FAILED' });

    expect(result).toEqual({ ok: false, reason: 'REASON_REQUIRED' });
  });

  it('scopes the lookup to the requesting partner, so another rider gets NOT_FOUND', async () => {
    dbMock.deliveryAssignment.findFirst.mockResolvedValue(null);

    const result = await advanceAssignment({ orderId: 'ord_1', partnerId: 'someone_else', to: 'PICKED_UP' });

    expect(result).toEqual({ ok: false, reason: 'NOT_FOUND' });
  });
});

describe('notification rendering (M8)', () => {
  it('renders every template in Marathi with real Devanagari and no leftover placeholders', () => {
    const cases: Array<[string, Record<string, unknown>]> = [
      [TEMPLATE.orderSubstituted, { date: '2026-08-12', substitutions: [{ from: 'पालक', to: 'मेथी' }] }],
      [TEMPLATE.orderItemDropped, { date: '2026-08-12', dropped: ['भेंडी'], allDropped: false }],
      [TEMPLATE.orderItemDropped, { date: '2026-08-12', dropped: [], allDropped: true }],
      [TEMPLATE.orderPaymentPending, { date: '2026-08-12', amountPaise: '15000' }],
      [TEMPLATE.orderSkippedUnpaid, { date: '2026-08-12' }],
      [TEMPLATE.orderStatusChanged, { orderNumber: 'AC-1', status: 'OUT_FOR_DELIVERY' }],
      [TEMPLATE.lowWalletBalance, { balancePaise: '5000', neededPaise: '15000' }],
      [
        TEMPLATE.tomorrowPreview,
        { date: '2026-08-13', totalPaise: '18000', items: [{ nameMr: 'पालक' }] },
      ],
      [TEMPLATE.subscriptionExpiring, { daysLeft: 2 }],
      [TEMPLATE.subscriptionCancelled, { refundedPaise: '9900', remainingDays: 5 }],
      [TEMPLATE.mealPlanReady, { flaggedForReview: false }],
      [TEMPLATE.mealPlanReady, { flaggedForReview: true }],
    ];

    const devanagari = /[ऀ-ॿ]/;
    for (const [templateKey, payload] of cases) {
      const rendered = renderNotification(templateKey as never, 'mr', payload);
      expect(rendered.title.length, `${templateKey} title`).toBeGreaterThan(0);
      expect(rendered.body.length, `${templateKey} body`).toBeGreaterThan(0);
      expect(devanagari.test(rendered.title), `${templateKey} title has no Devanagari`).toBe(true);
      // Every variable the payload supplied must have been substituted — a
      // literal "{amount}" reaching a customer's phone is worse than nothing.
      expect(rendered.body, `${templateKey} body has an unfilled placeholder`).not.toMatch(/\{[a-zA-Z]+\}/);
    }
  });

  it('picks the flagged variant only when the plan was actually flagged', () => {
    const plain = renderNotification(TEMPLATE.mealPlanReady, 'en', { flaggedForReview: false });
    const flagged = renderNotification(TEMPLATE.mealPlanReady, 'en', { flaggedForReview: true });
    expect(flagged.body).not.toBe(plain.body);
    expect(flagged.body.toLowerCase()).toContain('doctor');
  });

  it('resolves the order status word through the same orders.status catalogue the customer app uses', () => {
    const rendered = renderNotification(TEMPLATE.orderStatusChanged, 'mr', {
      orderNumber: 'AC-1',
      status: 'OUT_FOR_DELIVERY',
    });
    expect(rendered.body).toContain('रस्त्यावर आहे');
  });
});

describe('M8 channel table (B16)', () => {
  it('never sends a non-OTP notification over plain SMS', () => {
    for (const channels of Object.values(CHANNELS_BY_TEMPLATE)) {
      expect(channels).not.toContain('SMS');
    }
  });

  it('always includes IN_APP as the durable record', () => {
    for (const channels of Object.values(CHANNELS_BY_TEMPLATE)) {
      expect(channels).toContain('IN_APP');
    }
  });

  it('routes the low-balance warning over WhatsApp, per B16', () => {
    expect(CHANNELS_BY_TEMPLATE[TEMPLATE.lowWalletBalance]).toContain('WHATSAPP');
  });
});

describe('daily summary (M10 — COD cash collected)', () => {
  it('counts delivered, failed and pending, and sums COD only for delivered orders', async () => {
    dbMock.deliveryAssignment.findMany.mockResolvedValue([
      { status: 'DELIVERED', order: { totalPaise: 5000n, paymentMethod: 'COD' } },
      { status: 'DELIVERED', order: { totalPaise: 3000n, paymentMethod: 'WALLET' } },
      { status: 'FAILED', order: { totalPaise: 2000n, paymentMethod: 'COD' } },
      { status: 'OUT_FOR_DELIVERY', order: { totalPaise: 4000n, paymentMethod: 'COD' } },
    ]);

    const summary = await getDailySummary('dpt_1');

    expect(summary.delivered).toBe(2);
    expect(summary.failed).toBe(1);
    expect(summary.pending).toBe(1);
    // Only the DELIVERED COD order counts — an undelivered or wallet-paid
    // order never put cash in the rider's pocket.
    expect(summary.codCollectedPaise).toBe(5000n);
  });
});

describe('delivery-partner CRUD (M9/M10)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMock.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(dbMock));
  });

  it('refuses to create a rider on a phone number already in use', async () => {
    dbMock.user.findUnique.mockResolvedValue({ id: 'usr_existing' });

    const result = await createDeliveryPartner(
      { phone: '9999900002', name: 'Test', vehicleType: 'BIKE', serviceAreaId: null },
      'usr_admin',
      null,
    );

    expect(result).toEqual({ ok: false, reason: 'PHONE_IN_USE' });
    expect(dbMock.user.create).not.toHaveBeenCalled();
  });

  it('creates the user and partner row together, and audits it', async () => {
    dbMock.user.findUnique.mockResolvedValue(null);
    dbMock.user.create.mockResolvedValue({ id: 'usr_new' });
    dbMock.deliveryPartner.create.mockResolvedValue({});

    const result = await createDeliveryPartner(
      { phone: '9999900099', name: 'Nutan Kale', vehicleType: 'BIKE', serviceAreaId: null },
      'usr_admin',
      null,
    );

    expect(result.ok).toBe(true);
    expect(dbMock.deliveryPartner.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: 'usr_new', isAvailable: false }),
      }),
    );
    expect(dbMock.auditLog.create).toHaveBeenCalled();
  });

  it('reports today\'s load per partner, from the same figure B12 ranks by', async () => {
    dbMock.deliveryPartner.findMany.mockResolvedValue([
      {
        id: 'dpt_1',
        userId: 'usr_1',
        vehicleType: 'BIKE',
        isAvailable: true,
        serviceAreaId: null,
        user: { name: 'Ramesh', phone: '9999911111' },
        serviceArea: null,
      },
    ]);
    dbMock.deliveryAssignment.groupBy.mockResolvedValue([
      { partnerId: 'dpt_1', _count: { partnerId: 3 } },
    ]);

    const rows = await listDeliveryPartners();

    expect(rows).toHaveLength(1);
    expect(rows[0].todayLoad).toBe(3);
  });
});
