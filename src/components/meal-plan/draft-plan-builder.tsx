'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Loader2, Sprout, X } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { api, qs } from '@/lib/api/client';
import { formatPaise, paise } from '@/lib/money';
import { formatQuantity, type QuantityUnit } from '@/lib/quantity';
import { cn } from '@/lib/utils';

/**
 * The real, AI-backed successor to the interim static `BasePlanBuilder`
 * (D-204/205): one day visible at a time behind a horizontal day-tab strip
 * — doc §19's own guidance ("for longer plans, use pagination/accordion/
 * day navigation rather than loading an overwhelming full screen") — with
 * a selected option showing an inline quantity stepper right in its pill.
 * Vegetables is the one multi-select category (doc §10/§11); everything
 * else is single.
 */

export interface DraftOptionView {
  id: string;
  productId: string;
  name: string;
  imageUrl: string | null;
  pricePaise: string | null;
  suggestedQuantity: number | null;
  quantityUnit: string | null;
  inStock: boolean;
  selected: boolean;
  chosenQuantity: number | null;
}

export interface DraftCategoryView {
  id: string;
  category: 'BREAKFAST' | 'FRUITS' | 'DAIRY' | 'OTHER' | 'VEGETABLES';
  selectionType: 'SINGLE' | 'MULTIPLE';
  options: DraftOptionView[];
}

export interface DraftDayView {
  dayNumber: number;
  categories: DraftCategoryView[];
}

export interface DraftView {
  id: string;
  status: string;
  planType: string;
  flaggedForReview: boolean;
  days: DraftDayView[];
}

const CATEGORY_LABEL_KEY: Record<DraftCategoryView['category'], string> = {
  BREAKFAST: 'categoryBreakfast',
  FRUITS: 'categoryFruits',
  DAIRY: 'categoryDairy',
  OTHER: 'categoryOther',
  VEGETABLES: 'categoryVegetables',
};

/** A quantity nudge step per unit family — a coarse but sensible increment. */
function stepFor(unit: string | null): number {
  if (unit === 'G') return 250;
  if (unit === 'ML') return 250;
  return 1;
}

export function DraftPlanBuilder({ onConfirm }: { onConfirm: () => void }) {
  const t = useTranslations('mealPlan.basePlan');
  const tDays = useTranslations('mealPlan.days');
  const tDaysShort = useTranslations('mealPlan.daysShort');
  const locale = useLocale();
  const queryClient = useQueryClient();
  const [activeDayIndex, setActiveDayIndex] = useState(0);

  const draftQuery = useQuery({
    queryKey: ['meal-plan-draft-current', locale],
    queryFn: () => api.get<{ draft: DraftView | null }>(`/api/meal-plan/draft/current${qs({ locale })}`),
  });

  const select = useMutation({
    mutationFn: (input: { optionId: string; selected: boolean; chosenQuantity?: number }) =>
      api.patch<{ draft: DraftView }>(
        `/api/meal-plan/draft/${draft?.id}/select${qs({ locale })}`,
        input,
      ),
    onSuccess: (data) => {
      queryClient.setQueryData(['meal-plan-draft-current', locale], { draft: data.draft });
    },
  });

  const draft = draftQuery.data?.draft ?? null;

  if (draftQuery.isLoading || !draft) {
    return (
      <main className="pb-2">
        <div className="flex items-center justify-center bg-card px-6 py-24">
          <Loader2 className="size-8 animate-spin text-primary" aria-hidden />
        </div>
      </main>
    );
  }

  const totalCells = draft.days.reduce((sum, day) => sum + day.categories.length, 0);
  const selectedCells = draft.days.reduce(
    (sum, day) => sum + day.categories.filter((cat) => cat.options.some((o) => o.selected)).length,
    0,
  );
  const allSelected = selectedCells === totalCells;
  const activeDay = draft.days[Math.min(activeDayIndex, draft.days.length - 1)];

  function toggleOption(category: DraftCategoryView, option: DraftOptionView) {
    if (category.selectionType === 'SINGLE' && option.selected) return; // Tap a selected single pick again does nothing.
    select.mutate({
      optionId: option.id,
      selected: !option.selected,
      chosenQuantity: option.suggestedQuantity ?? undefined,
    });
  }

  function nudgeQuantity(option: DraftOptionView, delta: number) {
    if (!option.chosenQuantity) return;
    const next = Math.max(1, option.chosenQuantity + delta);
    select.mutate({ optionId: option.id, selected: true, chosenQuantity: next });
  }

  return (
    <main className="space-y-3 bg-secondary px-4 py-4 pb-24">
      <div className="rounded-[var(--radius)] border border-border bg-card px-4 py-5">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-tint-green text-primary">
            <Sprout className="size-5" aria-hidden />
          </span>
          <div>
            <h1 className="text-lg leading-snug font-black text-balance">{t('builderTitle')}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{t('builderHint')}</p>
          </div>
        </div>
      </div>

      {/* Day-tab strip — one day's categories on screen at a time, doc §19. */}
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {draft.days.map((day, index) => {
          const dayDone = day.categories.every((cat) => cat.options.some((o) => o.selected));
          return (
            <button
              key={day.dayNumber}
              type="button"
              onClick={() => setActiveDayIndex(index)}
              aria-pressed={index === activeDayIndex}
              className={cn(
                'flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-4 text-sm font-semibold transition-colors',
                index === activeDayIndex
                  ? 'bg-foreground text-background'
                  : 'border border-border bg-card text-muted-foreground',
              )}
            >
              {dayDone && index !== activeDayIndex && (
                <Check className="size-3.5 text-primary" aria-hidden />
              )}
              {tDaysShort(String(day.dayNumber))}
            </button>
          );
        })}
      </div>

      {activeDay && (
        <section className="divide-y divide-border rounded-[var(--radius)] border border-border bg-card px-4">
          <h2 className="py-3 text-sm font-black">{tDays(String(activeDay.dayNumber))}</h2>

          {activeDay.categories.map((category) => (
            <div key={category.id} className="py-3">
              <p className="text-xs font-bold tracking-wide text-muted-foreground uppercase">
                {t(CATEGORY_LABEL_KEY[category.category])}
                {category.selectionType === 'MULTIPLE' && ` · ${t('multiSelectHint')}`}
              </p>

              <div className="mt-2 flex flex-wrap gap-2">
                {category.options.map((option) => {
                  const price = option.pricePaise
                    ? formatPaise(paise(option.pricePaise), { hidePaise: true })
                    : null;

                  if (option.selected) {
                    return (
                      <div
                        key={option.id}
                        className="flex w-full items-center justify-between gap-2 rounded-[var(--radius)] border-2 border-primary bg-tint-green px-3 py-2"
                      >
                        <span className="flex min-w-0 items-center gap-2 text-sm font-semibold text-primary-dark">
                          <Check className="size-4 shrink-0" aria-hidden />
                          <span className="truncate">
                            {option.name}
                            {price && ` · ${price}`}
                          </span>
                        </span>

                        <div className="flex shrink-0 items-center gap-1.5">
                          {option.chosenQuantity && option.quantityUnit && (
                            <>
                              <button
                                type="button"
                                onClick={() => nudgeQuantity(option, -stepFor(option.quantityUnit))}
                                disabled={select.isPending}
                                aria-label={`${option.name} −`}
                                className="grid size-8 place-items-center rounded-full bg-card text-primary-dark disabled:opacity-40"
                              >
                                −
                              </button>
                              <span className="min-w-10 text-center text-xs font-bold whitespace-nowrap text-primary-dark">
                                {formatQuantity(option.chosenQuantity, option.quantityUnit as QuantityUnit)}
                              </span>
                              <button
                                type="button"
                                onClick={() => nudgeQuantity(option, stepFor(option.quantityUnit))}
                                disabled={select.isPending}
                                aria-label={`${option.name} +`}
                                className="grid size-8 place-items-center rounded-full bg-card text-primary-dark disabled:opacity-40"
                              >
                                +
                              </button>
                            </>
                          )}

                          {/* Only MULTIPLE (Vegetables) needs an explicit remove —
                              a SINGLE category's pick is replaced by tapping a
                              different option, never left with nothing selected. */}
                          {category.selectionType === 'MULTIPLE' && (
                            <button
                              type="button"
                              onClick={() => toggleOption(category, option)}
                              disabled={select.isPending}
                              aria-label={`${option.name} — remove`}
                              className="grid size-8 place-items-center rounded-full bg-card text-primary-dark disabled:opacity-40"
                            >
                              <X className="size-3.5" aria-hidden />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  }

                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => toggleOption(category, option)}
                      disabled={!option.inStock || select.isPending}
                      className="min-h-11 rounded-[var(--radius)] border border-border px-3.5 text-sm font-medium disabled:opacity-40"
                    >
                      {option.name}
                      {price && ` · ${price}`}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </section>
      )}

      <div
        className="fixed inset-x-0 z-30 mx-auto max-w-[480px] border-t border-border bg-card px-4 py-3"
        style={{ bottom: 'calc(var(--bottom-nav-height) + env(safe-area-inset-bottom, 0px))' }}
      >
        <button
          type="button"
          onClick={onConfirm}
          disabled={!allSelected}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-[var(--radius)] bg-primary text-sm font-bold text-primary-foreground disabled:opacity-40"
        >
          {t('confirmButton')} ({selectedCells}/{totalCells})
        </button>
      </div>
    </main>
  );
}
