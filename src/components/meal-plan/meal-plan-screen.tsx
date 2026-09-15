'use client';

import { useQuery } from '@tanstack/react-query';
import { ChevronRight, HeartPulse, Leaf, Salad, ShieldCheck, Sparkles } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { LoginPrompt } from '@/components/shop/login-prompt';
import { Link } from '@/i18n/navigation';
import { useSession } from '@/hooks/use-session';
import { api, qs } from '@/lib/api/client';

/**
 * Wizard screen 1 — "My Meal Plan" home / entry point. Redesigned (session
 * 2026-09-15, client reference) from the old screen that embedded the whole
 * day×category `PlanTable` inline — that table now lives at
 * `/meal-plan/build/[day]` as its own multi-step wizard (day list → browse →
 * weekly review), reached from the CTA below, matching the reference's
 * separate "Home" screen that only decides where to go next.
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
      {/* ── Hero */}
      <div className="relative overflow-hidden bg-gradient-to-br from-tint-green via-tint-green to-tint-yellow px-5 pt-6 pb-8">
        <Leaf
          aria-hidden
          className="pointer-events-none absolute -top-4 -right-6 size-28 rotate-12 text-primary/10"
        />
        <Leaf
          aria-hidden
          className="pointer-events-none absolute -bottom-8 left-1/3 size-20 -rotate-12 text-primary/10"
        />
        <div className="relative z-10">
          <h1 className="text-2xl font-black text-primary-dark">{t('title')}</h1>
          <p className="mt-1 max-w-[80%] text-sm text-muted-foreground">{t('subtitle')}</p>
        </div>

        <div className="relative z-10 mt-5 grid grid-cols-3 gap-2">
          <InfoCard icon={Sparkles} label={t('wizard.homeFresh')} />
          <InfoCard icon={ShieldCheck} label={t('wizard.homeChoice')} />
          <InfoCard icon={HeartPulse} label={t('wizard.homeHealthy')} />
        </div>
      </div>

      <div className="space-y-3 px-4 pt-4">
        <Link
          href={hasSavedItems ? '/meal-plan/build/summary' : '/meal-plan/build'}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-[var(--radius)] bg-primary text-sm font-bold text-primary-foreground"
        >
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

function InfoCard({ icon: Icon, label }: { icon: typeof Leaf; label: string }) {
  return (
    <div className="flex flex-col items-center gap-1.5 rounded-[var(--radius)] bg-card/70 px-2 py-3 text-center">
      <Icon className="size-4 text-primary" aria-hidden />
      <span className="text-[11px] leading-tight font-semibold text-primary-dark">{label}</span>
    </div>
  );
}
