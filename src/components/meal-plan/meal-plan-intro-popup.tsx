'use client';

import { Carrot, CheckCircle2, X } from 'lucide-react';
import { useTranslations } from 'next-intl';

/**
 * Shown once, right after a brand-new user finishes onboarding (language +
 * name), before they land anywhere else — introduces "My Meal Plan" in
 * plain, non-technical terms so a first-time grocery customer understands
 * it in a few seconds. Wired from `ProfileForm`, since that's the one step
 * every new user passes through exactly once (`login-flow.tsx` only routes
 * here `if (result.isNewUser)`), so no extra "seen it" flag is needed.
 *
 * Same modal shell as `MandatoryDeliveryModePopup`
 * (meal-plan-screen.tsx) — centred card, dimmed backdrop, top-right close.
 */
export function MealPlanIntroPopup({
  onCreatePlan,
  onDismiss,
}: {
  onCreatePlan: () => void;
  onDismiss: () => void;
}) {
  const t = useTranslations('mealPlan.intro');
  const benefits = [t('benefit1'), t('benefit2'), t('benefit3'), t('benefit4')];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="relative w-full max-w-[420px] rounded-[calc(var(--radius)*1.6)] bg-background p-5">
        <button
          type="button"
          onClick={onDismiss}
          aria-label={t('later')}
          className="absolute top-3 right-3 grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground"
        >
          <X className="size-4" aria-hidden />
        </button>

        <div className="flex flex-col items-center text-center">
          <span className="grid size-14 shrink-0 place-items-center rounded-full bg-tint-green text-primary">
            <Carrot className="size-7" aria-hidden />
          </span>
          <h2 className="mt-3 text-lg font-black">{t('title')}</h2>
          <p className="mt-1.5 text-sm text-muted-foreground">{t('body')}</p>
        </div>

        <ul className="mt-4 space-y-2.5">
          {benefits.map((benefit) => (
            <li key={benefit} className="flex items-start gap-2.5 text-sm">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
              <span>{benefit}</span>
            </li>
          ))}
        </ul>

        <button
          type="button"
          onClick={onCreatePlan}
          className="mt-5 h-12 w-full rounded-full bg-primary text-sm font-bold text-primary-foreground"
        >
          {t('cta')}
        </button>

        <button
          type="button"
          onClick={onDismiss}
          className="mt-2 flex h-10 w-full items-center justify-center text-xs font-semibold text-muted-foreground"
        >
          {t('later')}
        </button>
      </div>
    </div>
  );
}
