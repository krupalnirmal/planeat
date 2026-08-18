'use client';

import { User, Users } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { PageHeader } from '@/components/shop/page-header';

/**
 * Doc §6 — two prominent selectable cards, Personal or Family. Neither
 * "starts" anything by itself; the parent state machine moves to the
 * matching intake flow.
 */
export function PlanTypeChooser({
  onChoose,
}: {
  onChoose: (planType: 'PERSONAL' | 'FAMILY') => void;
}) {
  const t = useTranslations('mealPlan.planType');
  const tc = useTranslations('common');

  return (
    <>
      <PageHeader title={t('title')} backHref="/meal-plan" backLabel={tc('back')} />
      <main className="space-y-3 px-4 py-5">
        <button
          type="button"
          onClick={() => onChoose('PERSONAL')}
          className="flex w-full items-center gap-4 rounded-[var(--radius)] border border-border bg-card p-5 text-left"
        >
          <span className="grid size-12 shrink-0 place-items-center rounded-full bg-tint-green text-primary">
            <User className="size-6" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-bold">{t('personalTitle')}</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">{t('personalDescription')}</p>
          </div>
        </button>

        <button
          type="button"
          onClick={() => onChoose('FAMILY')}
          className="flex w-full items-center gap-4 rounded-[var(--radius)] border border-border bg-card p-5 text-left"
        >
          <span className="grid size-12 shrink-0 place-items-center rounded-full bg-tint-green text-primary">
            <Users className="size-6" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-bold">{t('familyTitle')}</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">{t('familyDescription')}</p>
          </div>
        </button>
      </main>
    </>
  );
}
