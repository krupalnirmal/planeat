import { describe, expect, it } from 'vitest';
import {
  buildSchedule,
  canSkipDate,
  dateRange,
  hasExpired,
  isExpiringSoon,
  istDateKeyOf,
  istHourOf,
  generationTargetDate,
  remainingDays,
  totalDays,
} from '@/lib/subscription/schedule';

/**
 * M6's date rules. Every one of them decides whether somebody gets vegetables
 * tomorrow morning, so all of it is pure and all of it is pinned.
 *
 * IST is UTC+5:30, and the server runs in Singapore. A rule that is only
 * correct in IST-local time would be wrong in production every single day.
 */

const CUTOFF = 20; // SKIP_CUTOFF_HOUR

/** A UTC instant for a given IST wall-clock time. */
function ist(dateKey: string, hour: number, minute = 0): Date {
  return new Date(Date.parse(`${dateKey}T00:00:00Z`) + (hour * 60 + minute - 330) * 60_000);
}

describe('IST conversion', () => {
  it('reads the IST calendar date, not the UTC one', () => {
    // 19:00 UTC is already 00:30 IST the next day — the generation window.
    expect(istDateKeyOf(new Date('2026-08-11T19:00:00Z'))).toBe('2026-08-12');
    expect(istDateKeyOf(new Date('2026-08-11T18:29:00Z'))).toBe('2026-08-11');
  });

  it('reads the IST wall-clock hour', () => {
    expect(istHourOf(ist('2026-08-11', 20))).toBe(20);
    expect(istHourOf(ist('2026-08-11', 0, 30))).toBe(0);
  });

  it('generates for the IST date the 00:30 run belongs to', () => {
    // The job fires at 00:30 IST on the 12th and generates that morning's
    // delivery — the 06:30–09:00 slot six hours later.
    expect(generationTargetDate(ist('2026-08-12', 0, 30))).toBe('2026-08-12');
  });
});

describe('M6 — the 20:00 skip cutoff', () => {
  const now = ist('2026-08-11', 19, 30); // 19:30 IST on the 11th

  it('allows skipping tomorrow before the cutoff', () => {
    expect(canSkipDate('2026-08-12', now, CUTOFF)).toBe(true);
  });

  it('refuses tomorrow after the cutoff', () => {
    // By 20:00 the picklist is being prepared and the preview has gone out
    // with tomorrow's exact bill.
    expect(canSkipDate('2026-08-12', ist('2026-08-11', 20, 1), CUTOFF)).toBe(false);
  });

  it('refuses exactly at the cutoff', () => {
    expect(canSkipDate('2026-08-12', ist('2026-08-11', 20, 0), CUTOFF)).toBe(false);
  });

  it('always allows dates beyond tomorrow, whatever the time', () => {
    expect(canSkipDate('2026-08-15', ist('2026-08-11', 23, 59), CUTOFF)).toBe(true);
  });

  it('refuses today — it has already been generated', () => {
    expect(canSkipDate('2026-08-11', now, CUTOFF)).toBe(false);
  });

  it('refuses the past', () => {
    expect(canSkipDate('2026-08-01', now, CUTOFF)).toBe(false);
  });
});

describe('My Week statuses', () => {
  const now = ist('2026-08-11', 10);
  const period = { startDateKey: '2026-08-10', endDateKey: '2026-08-20' };

  it('shows a scheduled day as skippable when the cutoff allows', () => {
    const [day] = buildSchedule(
      [{ dateKey: '2026-08-14', orderStatus: null, exceptionType: null }],
      period,
      now,
      CUTOFF,
    );
    expect(day.status).toBe('SCHEDULED');
    expect(day.canSkip).toBe(true);
  });

  it('marks days outside the period', () => {
    const [before, after] = buildSchedule(
      [
        { dateKey: '2026-08-09', orderStatus: null, exceptionType: null },
        { dateKey: '2026-08-21', orderStatus: null, exceptionType: null },
      ],
      period,
      now,
      CUTOFF,
    );
    expect(before.status).toBe('OUTSIDE_PERIOD');
    expect(after.status).toBe('OUTSIDE_PERIOD');
  });

  it('lets an existing order OUTRANK an exception', () => {
    // If the cron generated it before the customer skipped, the order is the
    // truth on the ground — showing "skipped" for a delivery on a bike would
    // be a lie the customer acts on.
    const [day] = buildSchedule(
      [{ dateKey: '2026-08-12', orderStatus: 'OUT_FOR_DELIVERY', exceptionType: 'SKIP' }],
      period,
      now,
      CUTOFF,
    );
    expect(day.status).toBe('OUT_FOR_DELIVERY');
    expect(day.canSkip).toBe(false);
  });

  it('distinguishes a skip, a pause and an unpaid skip', () => {
    const days = buildSchedule(
      [
        { dateKey: '2026-08-13', orderStatus: null, exceptionType: 'SKIP' },
        { dateKey: '2026-08-14', orderStatus: null, exceptionType: 'PAUSE' },
        { dateKey: '2026-08-15', orderStatus: null, exceptionType: 'SKIPPED_UNPAID' },
      ],
      period,
      now,
      CUTOFF,
    );
    expect(days.map((day) => day.status)).toEqual(['SKIPPED', 'PAUSED', 'SKIPPED_UNPAID']);
  });

  it('never offers to skip a day that already has an order', () => {
    const [day] = buildSchedule(
      [{ dateKey: '2026-08-11', orderStatus: 'PLACED', exceptionType: null }],
      period,
      now,
      CUTOFF,
    );
    expect(day.canSkip).toBe(false);
  });

  it('reports the correct weekday number for each date', () => {
    const [monday, sunday] = buildSchedule(
      [
        { dateKey: '2026-08-10', orderStatus: null, exceptionType: null },
        { dateKey: '2026-08-16', orderStatus: null, exceptionType: null },
      ],
      period,
      now,
      CUTOFF,
    );
    expect(monday.dayOfWeek).toBe(1);
    expect(sunday.dayOfWeek).toBe(7);
  });
});

describe('date ranges', () => {
  it('produces N consecutive keys starting from the given day', () => {
    expect(dateRange('2026-08-10', 3)).toEqual(['2026-08-10', '2026-08-11', '2026-08-12']);
  });

  it('crosses a month boundary', () => {
    expect(dateRange('2026-08-30', 3)).toEqual(['2026-08-30', '2026-08-31', '2026-09-01']);
  });
});

describe('expiry (M6)', () => {
  const now = ist('2026-08-11', 10);

  it('fires the reminder exactly two days out', () => {
    expect(isExpiringSoon('2026-08-13', now)).toBe(true);
    expect(isExpiringSoon('2026-08-12', now)).toBe(false);
    expect(isExpiringSoon('2026-08-14', now)).toBe(false);
  });

  it('treats a period that ended yesterday as expired', () => {
    expect(hasExpired('2026-08-10', now)).toBe(true);
    expect(hasExpired('2026-08-11', now)).toBe(false);
  });
});

describe('prorated cancellation (B3)', () => {
  const now = ist('2026-08-11', 10);

  it('counts remaining days from TOMORROW — today is already on its way', () => {
    // Period ends on the 20th; from the 12th to the 20th inclusive is 9 days.
    expect(remainingDays('2026-08-20', now)).toBe(9);
  });

  it('is zero once the period has ended', () => {
    expect(remainingDays('2026-08-10', now)).toBe(0);
    expect(remainingDays('2026-08-11', now)).toBe(0);
  });

  it('counts the whole period inclusively', () => {
    expect(totalDays('2026-08-10', '2026-08-16')).toBe(7);
    expect(totalDays('2026-08-10', '2026-09-08')).toBe(30);
  });

  it('refunds the unused fraction of the plan fee', () => {
    // ₹99 fee over 30 days, cancelled with 9 days left → 9/30 of ₹99.
    const fee = 9_900n;
    const refund = (fee * BigInt(remainingDays('2026-08-20', now))) / BigInt(30);
    expect(refund).toBe(2_970n);
  });
});
