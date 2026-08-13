import type { OrderStatus } from '@/generated/prisma/enums';

/**
 * M3 — the order status machine.
 *
 *   PLACED → CONFIRMED → PACKED → OUT_FOR_DELIVERY → DELIVERED
 *
 * plus CANCELLED, FAILED_DELIVERY and REFUNDED, and PAYMENT_PENDING for the
 * daily meal-plan orders that Phase 6 generates before the wallet is debited.
 *
 * Transitions live in one table rather than scattered across routes, because
 * "can this order still be cancelled" is asked from the customer app, the
 * admin panel and the rider app, and three copies of that rule will disagree.
 */

const TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  // B3 — a meal-plan order held for insufficient balance. Retried at 08:00.
  PAYMENT_PENDING: ['PLACED', 'CANCELLED'],
  PLACED: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['PACKED', 'CANCELLED'],
  // Cancellation stops here: once it is packed, the vegetables are weighed,
  // bagged and labelled, and that cost is already spent.
  PACKED: ['OUT_FOR_DELIVERY', 'CANCELLED'],
  OUT_FOR_DELIVERY: ['DELIVERED', 'FAILED_DELIVERY'],
  DELIVERED: ['REFUNDED'],
  FAILED_DELIVERY: ['OUT_FOR_DELIVERY', 'CANCELLED', 'REFUNDED'],
  CANCELLED: ['REFUNDED'],
  REFUNDED: [],
};

/** Statuses from which no further transition is possible. */
export const TERMINAL_STATUSES: readonly OrderStatus[] = ['REFUNDED'];

/** The happy path, in order — used to render the tracking timeline. */
export const DELIVERY_TIMELINE: readonly OrderStatus[] = [
  'PLACED',
  'CONFIRMED',
  'PACKED',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
];

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function nextStatuses(from: OrderStatus): readonly OrderStatus[] {
  return TRANSITIONS[from];
}

/**
 * M3 — "cancel allowed until PACKED".
 *
 * Read as: the customer may cancel while the order has not yet been packed.
 * Admin can still cancel a PACKED order (the machine allows the transition);
 * this predicate is specifically about the customer-facing button.
 */
export function isCustomerCancellable(status: OrderStatus): boolean {
  return status === 'PLACED' || status === 'CONFIRMED' || status === 'PAYMENT_PENDING';
}

/** True once the order has reached a state the customer can report a problem with. */
export function isIssueReportable(status: OrderStatus): boolean {
  return status === 'DELIVERED' || status === 'FAILED_DELIVERY';
}

export function isTerminal(status: OrderStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

/** How far along the timeline this status sits, for the progress indicator. */
export function timelineIndex(status: OrderStatus): number {
  return DELIVERY_TIMELINE.indexOf(status);
}

export class IllegalTransitionError extends Error {
  constructor(
    readonly from: OrderStatus,
    readonly to: OrderStatus,
  ) {
    super(`Cannot move an order from ${from} to ${to}`);
    this.name = 'IllegalTransitionError';
  }
}
