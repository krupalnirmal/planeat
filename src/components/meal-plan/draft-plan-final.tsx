'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { Loader2, PartyPopper } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import { ApiClientError, api, qs } from '@/lib/api/client';
import { formatQuantity, type QuantityUnit } from '@/lib/quantity';
import type { DraftView } from './draft-plan-builder';

const CATEGORY_LABEL_KEY: Record<string, string> = {
  BREAKFAST: 'categoryBreakfast',
  FRUITS: 'categoryFruits',
  DAIRY: 'categoryDairy',
  OTHER: 'categoryOther',
  VEGETABLES: 'categoryVegetables',
};

/**
 * The real successor to the interim static `BasePlanFinal` (D-204/205):
 * doc §12's day-wise breakdown of ONLY what the customer selected (never a
 * rejected AI option), then doc §14's exact congratulations copy. "OK, Get
 * Started" resolves the draft into a real MealPlan (`finalize`) and lands
 * on the existing `/meal-plan` screen, which already has swap/regenerate/
 * approve-to-subscribe fully working.
 */
export function DraftPlanFinal({ draftId, onEdit }: { draftId: string; onEdit: () => void }) {
  const t = useTranslations('mealPlan.basePlan');
  const tDays = useTranslations('mealPlan.days');
  const te = useTranslations('errors');
  const locale = useLocale();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  const draftQuery = useQuery({
    queryKey: ['meal-plan-draft-current', locale],
    queryFn: () => api.get<{ draft: DraftView | null }>(`/api/meal-plan/draft/current${qs({ locale })}`),
  });
  const draft = draftQuery.data?.draft ?? null;

  const finalize = useMutation({
    mutationFn: () => api.post<{ mealPlanId: string }>(`/api/meal-plan/draft/${draftId}/finalize`),
    onSuccess: () => router.replace('/meal-plan'),
    onError: (err) => setError(err instanceof ApiClientError ? err.message : te('generic')),
  });

  if (draftQuery.isLoading || !draft) {
    return (
      <main className="pb-2">
        <div className="flex items-center justify-center bg-card px-6 py-24">
          <Loader2 className="size-8 animate-spin text-primary" aria-hidden />
        </div>
      </main>
    );
  }

  return (
    <main className="space-y-2 pb-2">
      <div className="bg-card px-4 py-6 text-center">
        <PartyPopper className="mx-auto size-10 text-primary" aria-hidden />
        <h1 className="mt-3 text-lg leading-snug font-black text-balance">{t('congratsMessage')}</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">{t('congratsSubtext')}</p>
      </div>

      <div className="bg-card px-4 py-4">
        <h2 className="text-sm font-black">{t('finalPlanTitle')}</h2>
        <div className="mt-3 space-y-3">
          {draft.days.map((day) => {
            const selected = day.categories.flatMap((cat) =>
              cat.options
                .filter((o) => o.selected)
                .map((o) => ({ ...o, categoryLabel: t(CATEGORY_LABEL_KEY[cat.category]) })),
            );
            if (selected.length === 0) return null;

            return (
              <div key={day.dayNumber} className="rounded-[var(--radius)] border border-border p-3">
                <p className="text-xs font-bold text-primary-dark">{tDays(String(day.dayNumber))}</p>
                <ul className="mt-1.5 space-y-1">
                  {selected.map((option) => (
                    <li key={option.id} className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">{option.categoryLabel}</span>
                      <span className="font-medium">
                        {option.name}
                        {option.chosenQuantity && option.quantityUnit
                          ? ` · ${formatQuantity(option.chosenQuantity, option.quantityUnit as QuantityUnit)}`
                          : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>

        <button type="button" onClick={onEdit} className="mt-4 text-xs font-bold text-primary underline underline-offset-2">
          {t('editPlan')}
        </button>
      </div>

      {error && (
        <p className="mx-4 rounded-[var(--radius)] bg-danger/10 px-3 py-2.5 text-sm text-danger">{error}</p>
      )}

      <div className="bg-card px-4 py-4">
        <button
          type="button"
          onClick={() => {
            setError(null);
            finalize.mutate();
          }}
          disabled={finalize.isPending}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-[var(--radius)] bg-primary text-sm font-bold text-primary-foreground disabled:opacity-50"
        >
          {finalize.isPending && <Loader2 className="size-4 animate-spin" aria-hidden />}
          {t('okButton')}
        </button>
      </div>
    </main>
  );
}
