'use client';

import { CalendarDays, ChevronRight, Package } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useDeliveryModePreference } from '@/hooks/use-delivery-mode-preference';

/** "Cancel", not "I'll decide later" (session 2026-09-27) — this popup is
    reopened on an already-made choice to change it, not asked for the
    first time, so the mandatory popup's own "decide later" wording would
    read oddly here. Tapping the backdrop cancels too, same as every other
    optional (non-mandatory) popup in this app. */

/**
 * Replaces the old pattern of popping `DeliveryModePopup` up again on every
 * single save (session 2026-09-27, user report — "I already picked once,
 * why does it keep asking every time I confirm?"). The mandatory popup on
 * the meal-plan home screen still asks once, the first time; after that,
 * this small tag is the only thing shown — it reflects the current
 * on-device preference (`useDeliveryModePreference`) and opens the same
 * Daily/Weekly picker, now purely on demand, only when tapped.
 */
export function DeliveryModeTag() {
  const tw = useTranslations('mealPlan.wizard');
  const tc = useTranslations('common');
  const [preference, setPreference] = useDeliveryModePreference();
  const [open, setOpen] = useState(false);

  if (!preference) return null;

  const Icon = preference === 'WEEKLY' ? Package : CalendarDays;
  const label = preference === 'WEEKLY' ? tw('deliveryModeWeekly') : tw('deliveryModeDaily');

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-2 rounded-full border border-primary/40 bg-tint-green px-3.5 py-2 text-left text-xs font-bold text-primary-dark"
      >
        <Icon className="size-3.5 shrink-0" aria-hidden />
        <span className="min-w-0 flex-1 truncate">{label}</span>
        <ChevronRight className="size-3.5 shrink-0" aria-hidden />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-[420px] rounded-[calc(var(--radius)*1.6)] bg-background p-5"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 className="text-center text-base font-black">{tw('deliveryModeTitle')}</h2>

            <div className="mt-4 space-y-2.5">
              <button
                type="button"
                onClick={() => {
                  setPreference('DAILY');
                  setOpen(false);
                }}
                className="flex w-full items-center gap-3 rounded-[var(--radius)] border-2 border-border bg-card p-3.5 text-left transition-colors active:border-primary active:bg-tint-green"
              >
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-tint-green text-primary">
                  <CalendarDays className="size-5" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold">{tw('deliveryModeDaily')}</span>
                  <span className="block text-xs text-muted-foreground">{tw('deliveryModeDailyHint')}</span>
                </span>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              </button>

              <button
                type="button"
                onClick={() => {
                  setPreference('WEEKLY');
                  setOpen(false);
                }}
                className="flex w-full items-center gap-3 rounded-[var(--radius)] border-2 border-border bg-card p-3.5 text-left transition-colors active:border-primary active:bg-tint-green"
              >
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-tint-green text-primary">
                  <Package className="size-5" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold">{tw('deliveryModeWeekly')}</span>
                  <span className="block text-xs text-muted-foreground">{tw('deliveryModeWeeklyHint')}</span>
                </span>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              </button>
            </div>

            <button
              type="button"
              onClick={() => setOpen(false)}
              className="mt-3 flex h-10 w-full items-center justify-center text-xs font-semibold text-muted-foreground"
            >
              {tc('cancel')}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
