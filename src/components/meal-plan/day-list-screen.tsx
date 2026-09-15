'use client';

import { ChevronRight, Leaf } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { PageHeader } from '@/components/shop/page-header';
import { DAYS, usePlanDraft } from './plan-draft-context';

/**
 * Wizard screen 2 — pick a day to add items for. The underlying plan is a
 * recurring weekly template (`MealPlanDay.dayOfWeek`, not a specific
 * calendar date — the same Monday repeats every week), so this deliberately
 * shows day names only, not calendar dates the reference mockup pairs them
 * with — showing "18 Aug" would misrepresent a plan that isn't tied to one
 * week.
 */
export function DayListScreen() {
  const t = useTranslations('mealPlan');
  const tc = useTranslations('common');
  const draft = usePlanDraft();

  if (draft.loading) {
    return (
      <>
        <PageHeader title={t('title')} backHref="/meal-plan" backLabel={tc('back')} />
        <main className="px-4 py-8 text-sm text-muted-foreground">{tc('loading')}</main>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={t('title')}
        subtitle={t('wizard.selectDayHint')}
        backHref="/meal-plan"
        backLabel={tc('back')}
      />
      <main className="space-y-3 p-4 pb-24">
        <ul className="divide-y divide-border overflow-hidden rounded-[var(--radius-2xl)] border border-border bg-card">
          {DAYS.map((day) => {
            const count = draft.itemCount(day);
            return (
              <li key={day}>
                <Link
                  href={`/meal-plan/build/${day}`}
                  className="flex items-center justify-between gap-3 px-4 py-3.5"
                >
                  <span className="text-sm font-semibold">{t(`days.${day}`)}</span>
                  <span className="flex items-center gap-2">
                    <span
                      className={
                        count > 0
                          ? 'rounded-full bg-tint-green px-2.5 py-0.5 text-xs font-bold text-primary-dark'
                          : 'text-xs text-muted-foreground'
                      }
                    >
                      {t('wizard.itemCount', { count })}
                    </span>
                    <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>

        <div className="flex items-center gap-2.5 rounded-[var(--radius)] bg-tint-green px-4 py-3 text-sm text-primary-dark">
          <Leaf className="size-4 shrink-0" aria-hidden />
          {t('wizard.planWeekTip')}
        </div>
      </main>

      {draft.weekItemCount() > 0 && (
        <div
          className="fixed inset-x-0 z-30 mx-auto max-w-[480px] border-t border-border bg-card p-4"
          style={{ bottom: 'calc(var(--bottom-nav-height) + env(safe-area-inset-bottom, 0px))' }}
        >
          <Link
            href="/meal-plan/build/summary"
            className="flex h-12 w-full items-center justify-center gap-2 rounded-[var(--radius)] bg-primary text-sm font-bold text-primary-foreground"
          >
            {t('wizard.viewPlan', { count: draft.weekItemCount() })}
            <ChevronRight className="size-4" aria-hidden />
          </Link>
        </div>
      )}
    </>
  );
}
