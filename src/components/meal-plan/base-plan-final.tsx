'use client';

import { PartyPopper } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import type { AppLocale } from '@/i18n/routing';
import { PLAN_CATEGORIES, type PlanCategory } from '@/lib/meal-plan/base-plan-template';
import type { FinalSelection } from './base-plan-builder';

const CATEGORY_LABEL_KEY: Record<PlanCategory, string> = {
  sprouts: 'categorySprouts',
  fruits: 'categoryFruits',
  dairy: 'categoryDairy',
  extras: 'categoryExtras',
  mainMeal: 'categoryMainMeal',
};

/**
 * The read-only summary shown once every day/category is picked — just the
 * chosen items, day by day — plus the client's exact congratulations
 * copy. "OK, Get Started" today confirms the plan and returns to the Meal
 * Plan tab; wiring it to a real subscription/delivery schedule needs the
 * selected items matched to real catalogue products first (D-204 — this
 * content isn't product-backed yet).
 */
export function BasePlanFinal({
  selection,
  onEdit,
}: {
  selection: FinalSelection[];
  onEdit: () => void;
}) {
  const t = useTranslations('mealPlan.basePlan');
  const tDays = useTranslations('mealPlan.days');
  const locale = useLocale() as AppLocale;
  const router = useRouter();

  return (
    <main className="space-y-2 pb-2">
      <div className="bg-tint-green px-4 py-6 text-center">
        <span className="mx-auto grid size-14 place-items-center rounded-full bg-card text-primary shadow-sm">
          <PartyPopper className="size-7" aria-hidden />
        </span>
        <p className="mt-3 text-lg leading-snug font-black text-primary-dark text-balance">
          {t('congratsMessage')}
        </p>
        <p className="mt-1.5 text-sm text-muted-foreground">{t('congratsSubtext')}</p>
      </div>

      <div className="bg-card px-4 py-4">
        <div className="flex items-center justify-between">
          <h1 className="text-base font-black">{t('finalPlanTitle')}</h1>
          <button type="button" onClick={onEdit} className="text-xs font-bold text-primary">
            {t('editPlan')}
          </button>
        </div>

        <div className="mt-3 divide-y divide-border overflow-hidden rounded-[var(--radius)] border border-border">
          {selection.map((day) => (
            <div key={day.day} className="px-3 py-3">
              <p className="text-sm font-bold">{tDays(day.day)}</p>
              <dl className="mt-1.5 space-y-1">
                {PLAN_CATEGORIES.map((category) => {
                  const item = day.items[category];
                  if (!item) return null;
                  return (
                    <div key={category} className="flex gap-2 text-xs">
                      <dt className="w-28 shrink-0 text-muted-foreground">{t(CATEGORY_LABEL_KEY[category])}</dt>
                      <dd className="font-medium">{item.label[locale]}</dd>
                    </div>
                  );
                })}
              </dl>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-card px-4 py-4">
        <button
          type="button"
          onClick={() => router.replace('/meal-plan')}
          className="flex h-12 w-full items-center justify-center rounded-[var(--radius)] bg-primary text-sm font-bold text-primary-foreground"
        >
          {t('okButton')}
        </button>
      </div>
    </main>
  );
}
