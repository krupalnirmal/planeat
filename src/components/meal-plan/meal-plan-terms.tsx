'use client';

import { FileText } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { PageHeader } from '@/components/shop/page-header';

const SECTION_KEYS = [
  ['section1Heading', 'section1Body'],
  ['section2Heading', 'section2Body'],
  ['section3Heading', 'section3Body'],
  ['section4Heading', 'section4Body'],
] as const;

/**
 * The client's "Make My Meal Plan" terms gate — shown once, before the
 * intake wizard, so a customer knows what they're about to get (a free,
 * common seasonal base plan with daily options, not an AI/dietitian-
 * personalised one) before answering any health questions. Distinct from
 * the wizard's own medical-safety disclaimer (S1/S2) further in: this
 * consent is about what kind of product this is, not a health warning.
 */
export function MealPlanTerms({ onAgree }: { onAgree: () => void }) {
  const t = useTranslations('mealPlan.terms');
  const tc = useTranslations('common');
  const [agreed, setAgreed] = useState(false);

  return (
    <>
      <PageHeader title={t('title')} backHref="/meal-plan" backLabel={tc('back')} />
      <main className="space-y-2 pb-2">
        <div className="bg-card px-4 py-5">
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-tint-green text-primary">
              <FileText className="size-5" aria-hidden />
            </span>
            <h1 className="mt-1.5 text-lg leading-snug font-black text-balance">{t('title')}</h1>
          </div>
        </div>

        {SECTION_KEYS.map(([headingKey, bodyKey], index) => (
          <section key={headingKey} className="bg-card px-4 py-4">
            <h2 className="flex items-center gap-2 text-sm font-bold">
              <span className="grid size-5 shrink-0 place-items-center rounded-full bg-tint-green text-[11px] font-bold text-primary-dark">
                {index + 1}
              </span>
              {t(headingKey)}
            </h2>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{t(bodyKey)}</p>
          </section>
        ))}

        <div className="bg-card px-4 py-5">
          <label className="flex cursor-pointer items-start gap-3 rounded-[var(--radius)] border border-border bg-background p-4">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(event) => setAgreed(event.target.checked)}
              className="mt-0.5 size-5 shrink-0 accent-[var(--primary)]"
            />
            <span className="text-sm leading-relaxed">{t('checkboxLabel')}</span>
          </label>

          <button
            type="button"
            onClick={onAgree}
            disabled={!agreed}
            className="mt-4 h-11 w-full rounded-[var(--radius)] bg-primary text-sm font-bold text-primary-foreground disabled:opacity-50"
          >
            {t('continueButton')}
          </button>
        </div>
      </main>
    </>
  );
}
