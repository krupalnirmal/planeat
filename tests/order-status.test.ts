import { describe, expect, it } from 'vitest';
import {
  DELIVERY_TIMELINE,
  canTransition,
  isCustomerCancellable,
  isIssueReportable,
  isTerminal,
  nextStatuses,
  timelineIndex,
} from '@/lib/orders/status';
import type { OrderStatus } from '@/generated/prisma/enums';

/**
 * M3's status machine. Three surfaces ask these questions — the customer app,
 * the admin panel and the rider app — so the answers live in one table and are
 * pinned here.
 */

const ALL_STATUSES: OrderStatus[] = [
  'PAYMENT_PENDING',
  'PLACED',
  'CONFIRMED',
  'PACKED',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'CANCELLED',
  'FAILED_DELIVERY',
  'REFUNDED',
];

describe('the happy path', () => {
  it('runs PLACED → CONFIRMED → PACKED → OUT_FOR_DELIVERY → DELIVERED', () => {
    for (let i = 0; i < DELIVERY_TIMELINE.length - 1; i++) {
      expect(canTransition(DELIVERY_TIMELINE[i], DELIVERY_TIMELINE[i + 1])).toBe(true);
    }
  });

  it('reports the right timeline position', () => {
    expect(timelineIndex('PLACED')).toBe(0);
    expect(timelineIndex('DELIVERED')).toBe(4);
    // Cancelled is off the happy path entirely.
    expect(timelineIndex('CANCELLED')).toBe(-1);
  });
});

describe('illegal transitions', () => {
  it('cannot skip a step', () => {
    expect(canTransition('PLACED', 'DELIVERED')).toBe(false);
    expect(canTransition('CONFIRMED', 'OUT_FOR_DELIVERY')).toBe(false);
  });

  it('cannot go backwards', () => {
    expect(canTransition('PACKED', 'CONFIRMED')).toBe(false);
    expect(canTransition('DELIVERED', 'OUT_FOR_DELIVERY')).toBe(false);
  });

  it('cannot cancel an order already on a bike or delivered', () => {
    expect(canTransition('OUT_FOR_DELIVERY', 'CANCELLED')).toBe(false);
    expect(canTransition('DELIVERED', 'CANCELLED')).toBe(false);
  });

  it('has no way out of REFUNDED', () => {
    expect(nextStatuses('REFUNDED')).toHaveLength(0);
    expect(isTerminal('REFUNDED')).toBe(true);
  });

  it('never lets a status transition to itself', () => {
    for (const status of ALL_STATUSES) {
      expect(canTransition(status, status)).toBe(false);
    }
  });
});

describe('customer cancellation — "allowed until PACKED"', () => {
  it('is allowed before packing', () => {
    expect(isCustomerCancellable('PLACED')).toBe(true);
    expect(isCustomerCancellable('CONFIRMED')).toBe(true);
    // B3 — a meal-plan order held for insufficient balance can be cancelled.
    expect(isCustomerCancellable('PAYMENT_PENDING')).toBe(true);
  });

  it('stops once the order is packed', () => {
    // The vegetables are weighed, bagged and labelled by then.
    expect(isCustomerCancellable('PACKED')).toBe(false);
    expect(isCustomerCancellable('OUT_FOR_DELIVERY')).toBe(false);
    expect(isCustomerCancellable('DELIVERED')).toBe(false);
  });

  it('still lets an admin cancel a packed order', () => {
    // The machine permits it; only the customer-facing predicate refuses.
    expect(canTransition('PACKED', 'CANCELLED')).toBe(true);
  });
});

describe('failed delivery', () => {
  it('can be retried, cancelled or refunded', () => {
    expect(canTransition('OUT_FOR_DELIVERY', 'FAILED_DELIVERY')).toBe(true);
    expect(canTransition('FAILED_DELIVERY', 'OUT_FOR_DELIVERY')).toBe(true);
    expect(canTransition('FAILED_DELIVERY', 'REFUNDED')).toBe(true);
  });
});

describe('issue reporting (B14)', () => {
  it('opens once the order has arrived, or failed to', () => {
    expect(isIssueReportable('DELIVERED')).toBe(true);
    expect(isIssueReportable('FAILED_DELIVERY')).toBe(true);
  });

  it('is closed before then — there is nothing to complain about yet', () => {
    expect(isIssueReportable('PLACED')).toBe(false);
    expect(isIssueReportable('OUT_FOR_DELIVERY')).toBe(false);
    expect(isIssueReportable('CANCELLED')).toBe(false);
  });
});
