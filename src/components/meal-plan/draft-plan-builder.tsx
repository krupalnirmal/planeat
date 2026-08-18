'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Loader2, Sprout } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { api, qs } from '@/lib/api/client';
import { formatPaise, paise } from '@/lib/money';
import { formatQuantity, type QuantityUnit } from '@/lib/quantity';
import { cn } from '@/lib/utils';

/**
 * The real, AI-backed successor to the interim static `BasePlanBuilder`
 * (D-204/205): same visual language — pill options that turn green and get
 * a checkmark on tap, a sticky "N/total selected" confirm bar — driven by a
 * real `MealPlanDraft` instead of a hand-authored template. Vegetables is
 * the one multi-select category (doc §10/§11); everything else is single.
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
  const locale = useLocale();
  const queryClient = useQueryClient();

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

      {draft.days.map((day) => (
        <section
          key={day.dayNumber}
          className="rounded-[var(--radius)] border border-border bg-card px-4 py-4"
        >
          <h2 className="text-sm font-black">{tDays(String(day.dayNumber))}</h2>

          <div className="mt-3 space-y-4">
            {day.categories.map((category) => (
              <div key={category.id}>
                <p className="text-xs font-semibold text-muted-foreground">
                  {t(CATEGORY_LABEL_KEY[category.category])}
                  {category.selectionType === 'MULTIPLE' && ` · ${t('multiSelectHint')}`}
                </p>
                <div className="mt-1.5 flex flex-wrap items-start gap-2">
                  {category.options.map((option) => (
                    <div key={option.id} className="flex flex-col items-center gap-1">
                      <button
                        type="button"
                        onClick={() => toggleOption(category, option)}
                        disabled={!option.inStock || select.isPending}
                        aria-pressed={option.selected}
                        className={cn(
                          'flex min-h-11 items-center gap-1.5 rounded-full border-2 px-3.5 text-sm font-semibold transition-colors disabled:opacity-40',
                          option.selected
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-border bg-background text-foreground',
                        )}
                      >
                        {option.selected && <Check className="size-3.5" aria-hidden />}
                        {option.name}
                        {option.pricePaise && (
                          <span className="opacity-80">
                            · {formatPaise(paise(option.pricePaise), { hidePaise: true })}
                          </span>
                        )}
                      </button>

                      {option.selected && option.chosenQuantity && option.quantityUnit && (
                        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                          <button
                            type="button"
                            onClick={() => nudgeQuantity(option, -stepFor(option.quantityUnit))}
                            aria-label={`${option.name} −`}
                            className="grid size-6 place-items-center rounded-full border border-border"
                          >
                            −
                          </button>
                          {formatQuantity(option.chosenQuantity, option.quantityUnit as QuantityUnit)}
                          <button
                            type="button"
                            onClick={() => nudgeQuantity(option, stepFor(option.quantityUnit))}
                            aria-label={`${option.name} +`}
                            className="grid size-6 place-items-center rounded-full border border-border"
                          >
                            +
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}

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
