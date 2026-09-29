import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `manage.ts` — skip/pause/resume/cancel. Mocked against `db`/settings/
 * wallet-credit, same pattern as `meal-plan-subscribe.test.ts`: the guard
 * clauses and the transaction's own writes are what's worth pinning, not
 * Prisma's SQL. `pauseSubscription`'s transaction timeout (25s, added this
 * session after a real P2028 against the remote dev database — a paused
 * range longer than ~7 days blew Prisma's 5s default doing one upsert per
 * day) is exercised live rather than here, since a mock never reproduces a
 * real network-latency timeout.
 */

const dbMock = vi.hoisted(() => ({
  subscription: { findUnique: vi.fn(), update: vi.fn() },
  order: { findFirst: vi.fn() },
  subscriptionException: { upsert: vi.fn(), deleteMany: vi.fn() },
  $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(dbMock)),
}));

vi.mock('@/lib/db', () => ({ db: dbMock }));

vi.mock('@/lib/settings', () => ({
  SETTING_KEYS: { skipCutoffHour: 'meal_plan.skip_cutoff_hour' },
  getSettingNumber: vi.fn().mockResolvedValue(20),
}));

vi.mock('@/lib/wallet/ledger', async () => {
  const actual = await vi.importActual<typeof import('@/lib/wallet/ledger')>('@/lib/wallet/ledger');
  return { ...actual, credit: vi.fn() };
});

vi.mock('@/lib/notifications/notify', () => ({
  TEMPLATE: { subscriptionCancelled: 'subscriptionCancelled' },
  notifyEvent: vi.fn(),
}));

import { credit } from '@/lib/wallet/ledger';
import { cancelSubscription, pauseSubscription, resumeSubscription, skipDay } from '@/lib/subscription/manage';

/** 19:30 IST on 2026-08-11 — before the 20:00 skip cutoff. */
const BEFORE_CUTOFF = new Date('2026-08-11T14:00:00Z');

const OWNED_SUBSCRIPTION = {
  id: 'sub_1',
  userId: 'user_1',
  status: 'ACTIVE',
  startDate: new Date('2026-08-10T00:00:00Z'),
  endDate: new Date('2026-09-08T00:00:00Z'), // 30-day period
  planFeePaise: 9_900n,
};

beforeEach(() => {
  vi.clearAllMocks();
  dbMock.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(dbMock));
  dbMock.subscription.findUnique.mockResolvedValue(OWNED_SUBSCRIPTION);
});

describe('skipDay', () => {
  it("refuses a subscription that isn't the caller's own", async () => {
    dbMock.subscription.findUnique.mockResolvedValue({ ...OWNED_SUBSCRIPTION, userId: 'someone_else' });

    const result = await skipDay('sub_1', 'user_1', '2026-08-12', BEFORE_CUTOFF);

    expect(result).toEqual({ ok: false, reason: 'NOT_FOUND' });
  });

  it('refuses a date outside the subscription period', async () => {
    const result = await skipDay('sub_1', 'user_1', '2026-09-09', BEFORE_CUTOFF);

    expect(result).toEqual({ ok: false, reason: 'OUTSIDE_PERIOD' });
  });

  it('refuses past the 20:00 cutoff for tomorrow', async () => {
    const afterCutoff = new Date('2026-08-11T15:00:00Z'); // 20:30 IST
    const result = await skipDay('sub_1', 'user_1', '2026-08-12', afterCutoff);

    expect(result).toEqual({ ok: false, reason: 'TOO_LATE' });
  });

  it('refuses a date the cron already generated an order for', async () => {
    dbMock.order.findFirst.mockResolvedValue({ id: 'ord_1' });

    const result = await skipDay('sub_1', 'user_1', '2026-08-12', BEFORE_CUTOFF);

    expect(result).toEqual({ ok: false, reason: 'ALREADY_GENERATED' });
  });

  it('records a SKIP exception for a valid, still-skippable date', async () => {
    dbMock.order.findFirst.mockResolvedValue(null);

    const result = await skipDay('sub_1', 'user_1', '2026-08-12', BEFORE_CUTOFF);

    expect(result).toEqual({ ok: true, dateKey: '2026-08-12' });
    expect(dbMock.subscriptionException.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ type: 'SKIP' }) }),
    );
  });
});

describe('pauseSubscription', () => {
  it('refuses an inverted date range', async () => {
    const result = await pauseSubscription('sub_1', 'user_1', '2026-08-20', '2026-08-15', BEFORE_CUTOFF);

    expect(result).toEqual({ ok: false, reason: 'INVALID_RANGE' });
  });

  it('refuses past the cutoff for a range starting tomorrow', async () => {
    const afterCutoff = new Date('2026-08-11T15:00:00Z');
    const result = await pauseSubscription('sub_1', 'user_1', '2026-08-12', '2026-08-15', afterCutoff);

    expect(result).toEqual({ ok: false, reason: 'TOO_LATE' });
  });

  it('upserts a PAUSE exception for every day in the range and sets status PAUSED', async () => {
    const result = await pauseSubscription('sub_1', 'user_1', '2026-08-13', '2026-08-20', BEFORE_CUTOFF);

    expect(result).toEqual({ ok: true, days: 8 });
    expect(dbMock.subscriptionException.upsert).toHaveBeenCalledTimes(8);
    expect(dbMock.subscription.update).toHaveBeenCalledWith({
      where: { id: 'sub_1' },
      data: { status: 'PAUSED' },
    });
    // The whole loop runs inside one transaction with an extended timeout —
    // the default 5s isn't enough for a week-plus of sequential upserts
    // against a real remote connection.
    expect(dbMock.$transaction).toHaveBeenCalledWith(expect.any(Function), { timeout: 25_000 });
  });

  it('is inclusive of both endpoints — a single-day pause is 1 day, not 0', async () => {
    const result = await pauseSubscription('sub_1', 'user_1', '2026-08-13', '2026-08-13', BEFORE_CUTOFF);

    expect(result).toEqual({ ok: true, days: 1 });
  });
});

describe('resumeSubscription', () => {
  it('refuses a subscription that is not the caller\'s own', async () => {
    dbMock.subscription.findUnique.mockResolvedValue(null);

    const result = await resumeSubscription('sub_1', 'user_1', BEFORE_CUTOFF);

    expect(result).toEqual({ ok: false, reason: 'NOT_FOUND' });
  });

  it('clears future PAUSE exceptions and reactivates the subscription', async () => {
    const result = await resumeSubscription('sub_1', 'user_1', BEFORE_CUTOFF);

    expect(result).toEqual({ ok: true });
    expect(dbMock.subscriptionException.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ type: 'PAUSE' }) }),
    );
    expect(dbMock.subscription.update).toHaveBeenCalledWith({
      where: { id: 'sub_1' },
      data: { status: 'ACTIVE' },
    });
  });
});

describe('cancelSubscription (B3 — prorated plan-fee refund)', () => {
  it('refuses a subscription already cancelled', async () => {
    dbMock.subscription.findUnique.mockResolvedValue({ ...OWNED_SUBSCRIPTION, status: 'CANCELLED' });

    const result = await cancelSubscription('sub_1', 'user_1', BEFORE_CUTOFF);

    expect(result).toEqual({ ok: false, reason: 'ALREADY_CANCELLED' });
  });

  it('refunds the unused fraction of the plan fee, credited to the wallet', async () => {
    // 30-day period, cancelled on day 2 (2026-08-11) — remaining counts from
    // tomorrow (2026-08-12) through the end date inclusive: 28 days left.
    const result = await cancelSubscription('sub_1', 'user_1', BEFORE_CUTOFF);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.remainingDays).toBe(28);
      expect(result.refundedPaise).toBe((9_900n * 28n) / 30n);
    }
    expect(credit).toHaveBeenCalledWith(
      expect.objectContaining({ amountPaise: (9_900n * 28n) / 30n, source: 'CANCELLATION' }),
      expect.anything(),
    );
  });

  it('skips the wallet credit entirely when nothing is left to refund', async () => {
    // endDate is 2026-09-08. Cancelling ON that day means "tomorrow" (IST)
    // is 2026-09-09 — past the end date — so remainingDays is 0.
    const onEndDate = new Date('2026-09-08T14:00:00Z'); // 19:30 IST on the period's last day
    const result = await cancelSubscription('sub_1', 'user_1', onEndDate);

    expect(result).toEqual({ ok: true, refundedPaise: 0n, remainingDays: 0 });
    expect(credit).not.toHaveBeenCalled();
  });
});
