'use client';

import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Salad, ShoppingCart } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { LoginPrompt } from '@/components/shop/login-prompt';
import { Link } from '@/i18n/navigation';
import { useSession } from '@/hooks/use-session';
import { api, qs } from '@/lib/api/client';

/**
 * Wizard screen 1 — "My Meal Plan" home / entry point. Restyled (session
 * 2026-09-17, client reference — a real hero photo + 3 illustrated feature
 * cards, `public/meal-plan/*`, cropped from the client's own asset sheet)
 * from the earlier gradient-and-lucide-icon version.
 *
 * The reference mockup also had a second row — "Quick & Smart Plan",
 * "Daily Dairy & Bakery", "Your Savings & Stats" (a fabricated "₹1200 saved
 * this month") — deliberately left out: none of those correspond to a real,
 * working feature (there is no curated starter pack, no savings-tracking
 * calculation anywhere in the app), and showing a made-up number would be
 * showing the customer something false about their own account.
 */

interface PlanSummary {
  plan: { days: Array<{ items: unknown[] }> } | null;
  hasActiveSubscription: boolean;
}

export function MealPlanScreen() {
  const t = useTranslations('mealPlan');
  const locale = useLocale();
  const { isLoggedIn, isLoading: sessionLoading } = useSession();

  const current = useQuery({
    queryKey: ['meal-plan-current', locale],
    queryFn: () => api.get<PlanSummary>(`/api/meal-plan/current${qs({ locale })}`),
    enabled: isLoggedIn,
  });

  if (sessionLoading || (isLoggedIn && current.isLoading)) {
    return (
      <main className="px-4 py-8 text-sm text-muted-foreground">{t('title')}…</main>
    );
  }

  if (!isLoggedIn) {
    return (
      <LoginPrompt
        icon={Salad}
        title={t('title')}
        bandSubtitle={t('subtitle')}
        description={t('loginDescription')}
        loginHref="/login?next=/meal-plan"
      />
    );
  }

  const data = current.data;
  const hasSavedItems = (data?.plan?.days ?? []).some((day) => day.items.length > 0);

  return (
    <main className="pb-6">
      <div className="px-5 pt-6 pb-2 text-center">
        <h1 className="text-2xl font-black text-primary-dark">{t('wizard.homeTitle')}</h1>
        <p className="mx-auto mt-2 max-w-[85%] text-sm text-muted-foreground">{t('subtitle')}</p>
      </div>

      <div className="px-4 pt-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/meal-plan/hero.jpg"
          alt=""
          className="aspect-[2.8/1] w-full rounded-[var(--radius-2xl)] object-cover"
        />
      </div>

      <div className="grid grid-cols-3 gap-2.5 px-4 pt-4">
        <FeatureCard image="/meal-plan/icon-fresh.png" label={t('wizard.homeFresh')} />
        <FeatureCard image="/meal-plan/icon-choice.png" label={t('wizard.homeChoice')} />
        <FeatureCard image="/meal-plan/icon-healthy.png" label={t('wizard.homeHealthy')} />
      </div>

      <div className="space-y-3 px-4 pt-4">
        <Link
          href={hasSavedItems ? '/meal-plan/build/summary' : '/meal-plan/build'}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-primary text-sm font-bold text-primary-foreground"
        >
          <ShoppingCart className="size-4" aria-hidden />
          {hasSavedItems ? t('wizard.viewMyPlanCta') : t('wizard.createMyPlanCta')}
          <ChevronRight className="size-4" aria-hidden />
        </Link>

        {/* The missing next step: a saved plan alone never did anything —
            nothing created the Subscription row the daily generation cron
            reads from. Hidden once one is already running, so this is
            never a double-subscribe entry point. */}
        {hasSavedItems && !data?.hasActiveSubscription && (
          <Link
            href="/meal-plan/subscribe"
            className="flex items-center justify-between rounded-[var(--radius-2xl)] bg-card px-4 py-3.5 text-sm font-bold text-primary-dark ring-1 ring-border"
          >
            {t('subscribe.cta')}
            <ChevronRight className="size-4" aria-hidden />
          </Link>
        )}

        {data?.hasActiveSubscription && (
          <Link
            href="/subscription"
            className="flex items-center justify-between rounded-[var(--radius-2xl)] bg-card px-4 py-3.5 text-sm font-bold text-primary-dark ring-1 ring-border"
          >
            {t('wizard.viewSubscription')}
            <ChevronRight className="size-4" aria-hidden />
          </Link>
        )}
      </div>
    </main>
  );
}

function FeatureCard({ image, label }: { image: string; label: string }) {
  return (
    <div className="overflow-hidden rounded-2xl">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={image} alt="" className="aspect-[19/10] w-full object-cover" />
      <p className="bg-primary py-2 text-center text-[11px] leading-tight font-bold text-primary-foreground">
        {label}
      </p>
    </div>
  );
}
