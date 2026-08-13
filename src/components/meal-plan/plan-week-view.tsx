'use client';

import { ArrowLeftRight, ChevronDown, ImageIcon, Sunrise, Sunset } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { SwapSheet } from '@/components/meal-plan/swap-sheet';
import { formatPaise, paise } from '@/lib/money';
import { formatQuantity, type QuantityUnit } from '@/lib/quantity';
import { cn } from '@/lib/utils';

/**
 * M5 — the week view: 7 day cards, each with a Morning and an Evening item
 * showing image, name, quantity and a one-line rationale. Tap a day to expand.
 *
 * The quantity shown here came from B4 in code, never from the model.
 * B6 — each item carries its own swap button, and a swap applies instantly.
 */

export interface PlanItemView {
  id: string;
  slot: 'MORNING' | 'EVENING';
  productId: string;
  name: string;
  imageUrl: string | null;
  quantity: number;
  unit: string;
  rationale: string | null;
  pricePaise: string | null;
  inStock: boolean;
}

export interface PlanDayView {
  dayOfWeek: number;
  items: PlanItemView[];
}

export function PlanWeekView({
  days,
  mealPlanId,
  swappable = false,
  onSwapped,
}: {
  days: PlanDayView[];
  mealPlanId: string;
  /** Swapping is only offered before the plan is approved and running. */
  swappable?: boolean;
  onSwapped?: () => void;
}) {
  const t = useTranslations('mealPlan');
  const tDays = useTranslations('mealPlan.days');

  // The first day opens by default so the screen is never a wall of closed
  // rows — somebody arriving here has waited a minute for this.
  const [expanded, setExpanded] = useState<number | null>(days[0]?.dayOfWeek ?? null);
  const [swapping, setSwapping] = useState<PlanItemView | null>(null);

  return (
    <>
      <ul className="space-y-3">
        {days.map((day) => {
        const isOpen = expanded === day.dayOfWeek;
        const morning = day.items.find((item) => item.slot === 'MORNING');
        const evening = day.items.find((item) => item.slot === 'EVENING');

        return (
          <li key={day.dayOfWeek} className="overflow-hidden rounded-[var(--radius)] bg-card">
            <button
              type="button"
              onClick={() => setExpanded(isOpen ? null : day.dayOfWeek)}
              aria-expanded={isOpen}
              className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left"
            >
              <span className="flex-1 text-sm font-bold">
                {tDays(String(day.dayOfWeek))}
              </span>

              {!isOpen && (
                <span className="truncate text-xs text-muted-foreground">
                  {[morning?.name, evening?.name].filter(Boolean).join(' · ')}
                </span>
              )}

              <ChevronDown
                className={cn(
                  'size-4 shrink-0 text-muted-foreground transition-transform',
                  isOpen && 'rotate-180',
                )}
                aria-hidden
              />
            </button>

            {isOpen && (
              <div className="divide-y divide-border border-t border-border">
                {morning && (
                  <MealRow
                    item={morning}
                    label={t('morning')}
                    icon={Sunrise}
                    swappable={swappable}
                    onSwap={() => setSwapping(morning)}
                  />
                )}
                {evening && (
                  <MealRow
                    item={evening}
                    label={t('evening')}
                    icon={Sunset}
                    swappable={swappable}
                    onSwap={() => setSwapping(evening)}
                  />
                )}
              </div>
            )}
          </li>
        );
        })}
      </ul>

      {swapping && (
        <SwapSheet
          mealPlanId={mealPlanId}
          itemId={swapping.id}
          currentName={swapping.name}
          onClose={() => setSwapping(null)}
          onApplied={() => onSwapped?.()}
        />
      )}
    </>
  );
}

function MealRow({
  item,
  label,
  icon: Icon,
  swappable,
  onSwap,
}: {
  item: PlanItemView;
  label: string;
  icon: typeof Sunrise;
  swappable: boolean;
  onSwap: () => void;
}) {
  const t = useTranslations('mealPlan');

  return (
    <div className="flex gap-3 px-4 py-3">
      <span className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-[calc(var(--radius)-6px)] bg-secondary">
        {item.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.imageUrl} alt="" aria-hidden className="size-full object-cover" />
        ) : (
          <ImageIcon className="size-6 text-muted-foreground/40" aria-hidden />
        )}
      </span>

      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
          <Icon className="size-3.5 text-accent" aria-hidden />
          {label}
        </p>

        <p className="mt-0.5 text-sm font-semibold">{item.name}</p>

        <p className="text-xs text-muted-foreground">
          {/* B4 — computed in code from the household, never by the model. */}
          {formatQuantity(item.quantity, item.unit as QuantityUnit)}
          {item.pricePaise && ` · ${formatPaise(paise(item.pricePaise), { hidePaise: true })}`}
        </p>

        {item.rationale && (
          <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground italic">
            {item.rationale}
          </p>
        )}
      </div>

      {/* B6 — one tap, three alternatives, applied instantly. No approval. */}
      {swappable && (
        <button
          type="button"
          onClick={onSwap}
          className="flex h-11 shrink-0 items-center gap-1.5 self-start rounded-[var(--radius)] border border-border px-3 text-xs font-semibold"
        >
          <ArrowLeftRight className="size-3.5 text-primary" aria-hidden />
          {t('swap')}
        </button>
      )}
    </div>
  );
}
