'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeftRight, CalendarX2, Check, Truck } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import { ApiClientError, api } from '@/lib/api/client';
import { formatPaise, paise } from '@/lib/money';
import { formatQuantity, type QuantityUnit } from '@/lib/quantity';
import { cn } from '@/lib/utils';

/**
 * M6 — "My Week screen: next 7 days with per-day status."
 *
 * The one screen a subscriber opens most, so it answers the two questions they
 * actually have: what is coming tomorrow, and can I still change it. Skipping
 * is inline rather than behind a manage screen, because "we're away on Friday"
 * is the single most common thing a customer wants to do.
 */

export type DayStatus =
  | 'SCHEDULED'
  | 'PLACED'
  | 'CONFIRMED'
  | 'PACKED'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED'
  | 'CANCELLED'
  | 'FAILED_DELIVERY'
  | 'PAYMENT_PENDING'
  | 'SKIPPED'
  | 'PAUSED'
  | 'SKIPPED_UNPAID'
  | 'OUTSIDE_PERIOD';

export interface WeekDay {
  dateKey: string;
  dayOfWeek: number;
  status: DayStatus;
  canSkip: boolean;
  orderId: string | null;
  totalPaise: string | null;
  items: Array<{
    slot: string;
    name: string;
    quantity: number;
    unit: string;
    isSubstituted: boolean;
  }>;
}

const TONE: Record<DayStatus, string> = {
  SCHEDULED: 'bg-secondary text-muted-foreground',
  PLACED: 'bg-primary/10 text-primary',
  CONFIRMED: 'bg-primary/10 text-primary',
  PACKED: 'bg-primary/10 text-primary',
  OUT_FOR_DELIVERY: 'bg-accent/20 text-[#8A5A2B]',
  DELIVERED: 'bg-primary/10 text-success',
  CANCELLED: 'bg-danger/10 text-danger',
  FAILED_DELIVERY: 'bg-danger/10 text-danger',
  PAYMENT_PENDING: 'bg-[#FDF3E3] text-warning',
  SKIPPED: 'bg-secondary text-muted-foreground',
  PAUSED: 'bg-secondary text-muted-foreground',
  SKIPPED_UNPAID: 'bg-[#FDF3E3] text-warning',
  OUTSIDE_PERIOD: 'bg-secondary text-muted-foreground',
};

export function MyWeek({
  subscriptionId,
  days,
  todayKey,
}: {
  subscriptionId: string;
  days: WeekDay[];
  todayKey: string;
}) {
  const t = useTranslations('subscription');
  const tStatus = useTranslations('subscription.status');
  const tDays = useTranslations('mealPlan.days');
  const te = useTranslations('errors');
  const format = useFormatter();
  const queryClient = useQueryClient();

  const [error, setError] = useState<string | null>(null);

  const skip = useMutation({
    mutationFn: (input: { date: string; undo: boolean }) =>
      api.post(`/api/subscriptions/${subscriptionId}/skip`, input),
    onSuccess: () => {
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ['subscription-current'] });
    },
    onError: (err) => {
      setError(
        err instanceof ApiClientError && err.code === 'CONFLICT'
          ? t('skipTooLate')
          : te('generic'),
      );
    },
  });

  const tomorrowKey = new Date(Date.parse(`${todayKey}T00:00:00Z`) + 86_400_000)
    .toISOString()
    .slice(0, 10);

  function dayLabel(dateKey: string, dayOfWeek: number): string {
    if (dateKey === todayKey) return t('today');
    if (dateKey === tomorrowKey) return t('tomorrow');
    return tDays(String(dayOfWeek));
  }

  return (
    <section>
      <h2 className="mb-3 flex items-center gap-2 text-base font-semibold">
        <Truck className="size-4 text-primary" aria-hidden />
        {t('myWeek')}
      </h2>

      {error && (
        <p className="mb-3 rounded-[var(--radius)] bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      <ul className="space-y-2">
        {days
          .filter((day) => day.status !== 'OUTSIDE_PERIOD')
          .map((day) => (
            <li key={day.dateKey} className="rounded-[var(--radius)] bg-card p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-bold">{dayLabel(day.dateKey, day.dayOfWeek)}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {format.dateTime(new Date(`${day.dateKey}T00:00:00Z`), {
                      day: 'numeric',
                      month: 'short',
                      timeZone: 'UTC',
                    })}
                    {' · '}
                    {t('slot')}
                  </p>
                </div>

                <span
                  className={cn(
                    'shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold',
                    TONE[day.status],
                  )}
                >
                  {tStatus(day.status)}
                </span>
              </div>

              {day.items.length > 0 && (
                <ul className="mt-2.5 space-y-1">
                  {day.items.map((item, index) => (
                    <li
                      key={`${day.dateKey}-${index}`}
                      className="flex items-center gap-2 text-xs text-muted-foreground"
                    >
                      <Check className="size-3 shrink-0 text-success" aria-hidden />
                      <span className="truncate">
                        {item.name} · {formatQuantity(item.quantity, item.unit as QuantityUnit)}
                      </span>
                      {/* B7 — a substitution is never silent. */}
                      {item.isSubstituted && (
                        <ArrowLeftRight
                          className="size-3 shrink-0 text-warning"
                          aria-label={t('substituted', { from: '', to: item.name })}
                        />
                      )}
                    </li>
                  ))}
                </ul>
              )}

              <div className="mt-2.5 flex items-center justify-between gap-3">
                <span className="text-xs font-semibold">
                  {day.totalPaise ? formatPaise(paise(day.totalPaise)) : ''}
                </span>

                {/* M6 — skip before 20:00 the previous day. */}
                {day.canSkip && day.status === 'SCHEDULED' && (
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm(t('skipConfirm', { date: day.dateKey }))) {
                        skip.mutate({ date: day.dateKey, undo: false });
                      }
                    }}
                    disabled={skip.isPending}
                    className="flex h-11 items-center gap-1.5 rounded-[var(--radius)] border border-border px-3 text-xs font-medium disabled:opacity-50"
                  >
                    <CalendarX2 className="size-3.5" aria-hidden />
                    {t('skip')}
                  </button>
                )}

                {day.status === 'SKIPPED' && (
                  <button
                    type="button"
                    onClick={() => skip.mutate({ date: day.dateKey, undo: true })}
                    disabled={skip.isPending}
                    className="h-11 rounded-[var(--radius)] border border-primary px-3 text-xs font-semibold text-primary disabled:opacity-50"
                  >
                    {t('unskip')}
                  </button>
                )}
              </div>
            </li>
          ))}
      </ul>
    </section>
  );
}
