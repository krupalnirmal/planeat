import { addDays, parseDateKey, toDateKey, weekdayNumber } from '@/lib/meal-plan/pricing';

/**
 * M6 — the delivery schedule. Pure, so every date rule can be pinned by tests.
 *
 * All of it runs on IST calendar days: the 00:30 generation window, the
 * 06:30–09:00 slot (B1), the 20:00 skip cutoff. Dates are handled as
 * `YYYY-MM-DD` keys anchored to UTC — see D-118. A local `Date` here would
 * shift every subscriber's plan by a day on a Singapore server.
 */

export { addDays, parseDateKey, toDateKey, weekdayNumber };

/** IST is UTC+5:30. */
const IST_OFFSET_MS = 5.5 * 3_600_000;

/** The IST calendar date for an instant. */
export function istDateKeyOf(instant: Date): string {
  return new Date(instant.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** The IST wall-clock hour, 0–23. */
export function istHourOf(instant: Date): number {
  return new Date(instant.getTime() + IST_OFFSET_MS).getUTCHours();
}

/**
 * The date the 00:30 job generates for.
 *
 * It runs just after midnight IST and generates for THAT morning's delivery —
 * the 06:30–09:00 slot six hours later. Calling it "tomorrow's order" is how
 * the brief describes it from the customer's evening perspective; from the
 * job's perspective at 00:30 it is today.
 */
export function generationTargetDate(now: Date): string {
  return istDateKeyOf(now);
}

/**
 * B3 / M6 — "Skip a day (before 20:00 previous day)".
 *
 * Past 20:00 IST the picklist is being prepared and the preview notification
 * has gone out with tomorrow's exact bill. A skip after that would mean
 * vegetables already weighed for somebody who is no longer expecting them.
 */
export function canSkipDate(targetDateKey: string, now: Date, cutoffHour: number): boolean {
  const todayKey = istDateKeyOf(now);

  // Any future date beyond tomorrow is always skippable.
  if (targetDateKey > toDateKey(addDays(parseDateKey(todayKey), 1))) return true;

  // Tomorrow is skippable only before the cutoff.
  if (targetDateKey === toDateKey(addDays(parseDateKey(todayKey), 1))) {
    return istHourOf(now) < cutoffHour;
  }

  // Today and anything past it is too late — it is already generated.
  return false;
}

export type DeliveryDayStatus =
  | 'DELIVERED'
  | 'OUT_FOR_DELIVERY'
  | 'PACKED'
  | 'CONFIRMED'
  | 'PLACED'
  | 'PAYMENT_PENDING'
  | 'CANCELLED'
  | 'FAILED_DELIVERY'
  | 'SKIPPED'
  | 'PAUSED'
  | 'SKIPPED_UNPAID'
  | 'SCHEDULED'
  | 'OUTSIDE_PERIOD';

export interface ScheduleDayInput {
  dateKey: string;
  /** The order for this date, if the cron has already generated it. */
  orderStatus: string | null;
  /** A SKIP / PAUSE / SKIPPED_UNPAID exception on this date. */
  exceptionType: string | null;
}

export interface ScheduleDay {
  dateKey: string;
  dayOfWeek: number;
  status: DeliveryDayStatus;
  /** Whether the customer can still skip this specific date. */
  canSkip: boolean;
}

/**
 * M6's "My Week": the next N days with a per-day status.
 *
 * Precedence matters. An exception wins over "scheduled" but NOT over an order
 * that already exists — if the cron generated it before the customer skipped,
 * the order is the truth on the ground and the screen must say so rather than
 * showing "skipped" for a delivery that is on a bike.
 */
export function buildSchedule(
  days: readonly ScheduleDayInput[],
  period: { startDateKey: string; endDateKey: string },
  now: Date,
  cutoffHour: number,
): ScheduleDay[] {
  return days.map((day) => {
    const dayOfWeek = weekdayNumber(parseDateKey(day.dateKey));

    if (day.dateKey < period.startDateKey || day.dateKey > period.endDateKey) {
      return { dateKey: day.dateKey, dayOfWeek, status: 'OUTSIDE_PERIOD', canSkip: false };
    }

    if (day.orderStatus) {
      return {
        dateKey: day.dateKey,
        dayOfWeek,
        status: day.orderStatus as DeliveryDayStatus,
        canSkip: false,
      };
    }

    if (day.exceptionType) {
      const status: DeliveryDayStatus =
        day.exceptionType === 'PAUSE'
          ? 'PAUSED'
          : day.exceptionType === 'SKIPPED_UNPAID'
            ? 'SKIPPED_UNPAID'
            : 'SKIPPED';
      return { dateKey: day.dateKey, dayOfWeek, status, canSkip: false };
    }

    return {
      dateKey: day.dateKey,
      dayOfWeek,
      status: 'SCHEDULED',
      canSkip: canSkipDate(day.dateKey, now, cutoffHour),
    };
  });
}

/** The N date keys starting from `fromDateKey`, inclusive. */
export function dateRange(fromDateKey: string, days: number): string[] {
  const start = parseDateKey(fromDateKey);
  return Array.from({ length: days }, (_, offset) => toDateKey(addDays(start, offset)));
}

/**
 * M6 — "Expiry reminder at T-2 days with one-tap renewal."
 *
 * Two days is enough for the customer to renew before the gap, and short
 * enough that they still remember agreeing to it.
 */
export function isExpiringSoon(endDateKey: string, now: Date, daysAhead = 2): boolean {
  const todayKey = istDateKeyOf(now);
  const target = toDateKey(addDays(parseDateKey(todayKey), daysAhead));
  return endDateKey === target;
}

export function hasExpired(endDateKey: string, now: Date): boolean {
  return endDateKey < istDateKeyOf(now);
}

/**
 * The unused portion of a period, for the prorated cancellation refund.
 *
 * Counted from tomorrow, not today: today's delivery has already been
 * generated and is on its way.
 */
export function remainingDays(endDateKey: string, now: Date): number {
  const tomorrow = toDateKey(addDays(parseDateKey(istDateKeyOf(now)), 1));
  if (endDateKey < tomorrow) return 0;

  const diffMs = parseDateKey(endDateKey).getTime() - parseDateKey(tomorrow).getTime();
  return Math.floor(diffMs / 86_400_000) + 1;
}

export function totalDays(startDateKey: string, endDateKey: string): number {
  const diffMs = parseDateKey(endDateKey).getTime() - parseDateKey(startDateKey).getTime();
  return Math.floor(diffMs / 86_400_000) + 1;
}
