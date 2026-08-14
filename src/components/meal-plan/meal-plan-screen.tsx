'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, RefreshCw, Salad, SlidersHorizontal } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { Link } from '@/i18n/navigation';
import { DoctorBanner, MedicalDisclaimer } from '@/components/meal-plan/medical-disclaimer';
import { PlanWeekView, type PlanDayView } from '@/components/meal-plan/plan-week-view';
import { LoginPrompt } from '@/components/shop/login-prompt';
import { PageHeader } from '@/components/shop/page-header';
import { MyWeek, type WeekDay } from '@/components/subscription/my-week';
import { useSession } from '@/hooks/use-session';
import { ApiClientError, api, qs } from '@/lib/api/client';
import { formatPaise, paise } from '@/lib/money';
import { cn } from '@/lib/utils';

/**
 * The My Meal Plan tab (M5).
 *
 * Three states: no profile yet (start), a plan (week view), or a profile that
 * has moved on since the plan was built (B5 — offer regeneration, never do it
 * silently: a regeneration replaces a plan the customer may be happy with).
 */

interface PlanResponse {
  plan: {
    id: string;
    version: number;
    status: string;
    overallNote: string | null;
    flaggedForReview: boolean;
    aiProvider: string | null;
    estimatedDailyCostPaise: string;
    days: PlanDayView[];
  } | null;
  hasProfile: boolean;
  hasConsent: boolean;
  profileChangedSincePlan: boolean;
}

interface SubscriptionResponse {
  subscription: {
    id: string;
    status: 'ACTIVE' | 'PAUSED' | 'CANCELLED' | 'COMPLETED';
    endDate: string;
    daysUntilEnd: number;
  } | null;
  week: { subscriptionId: string; days: WeekDay[] } | null;
}

export function MealPlanScreen() {
  const t = useTranslations('mealPlan');
  const tc = useTranslations('common');
  const tSub = useTranslations('subscription');
  const locale = useLocale();
  const queryClient = useQueryClient();
  const { isLoggedIn, isLoading: sessionLoading } = useSession();

  const [error, setError] = useState<string | null>(null);

  const current = useQuery({
    queryKey: ['meal-plan-current', locale],
    queryFn: () => api.get<PlanResponse>(`/api/meal-plan/current${qs({ locale })}`),
    enabled: isLoggedIn,
  });

  // M6 — once a plan is approved, the subscription and its week become the
  // point of this tab; the template moves below them.
  const subscription = useQuery({
    queryKey: ['subscription-current'],
    queryFn: () => api.get<SubscriptionResponse>('/api/subscriptions/current'),
    enabled: isLoggedIn,
  });

  const regenerate = useMutation({
    mutationFn: (planId: string) =>
      api.post<{ mealPlanId: string }>(`/api/meal-plan/${planId}/regenerate${qs({ locale })}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['meal-plan-current'] });
      setError(null);
    },
    onError: (err) => {
      setError(
        err instanceof ApiClientError && err.code === 'BAD_REQUEST'
          ? t('notEnoughVeg')
          : t('generateFailed'),
      );
    },
  });

  if (sessionLoading || (isLoggedIn && current.isLoading)) {
    return (
      <>
        <PageHeader title={t('title')} />
        <main className="pb-2">
          <div className="bg-card px-4 py-8 text-sm text-muted-foreground">{tc('loading')}</div>
        </main>
      </>
    );
  }

  // B17 — the meal plan is a commitment point, so it needs a login.
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
  const plan = data?.plan ?? null;
  const activeSubscription =
    subscription.data?.subscription?.status === 'ACTIVE' ||
    subscription.data?.subscription?.status === 'PAUSED'
      ? subscription.data.subscription
      : null;
  const week = subscription.data?.week ?? null;

  // ── No plan yet.
  if (!plan) {
    return (
      <>
        <PageHeader title={t('title')} />
        <main className="pb-2">
          <div className="bg-card px-6 pt-10 pb-6">
            <div className="flex flex-col items-center text-center">
              <Salad className="size-12 text-primary/40" aria-hidden />
              <p className="mt-4 text-sm text-muted-foreground">{t('startHint')}</p>

              <Link
                href="/meal-plan/onboarding"
                className="mt-6 flex h-12 w-full max-w-xs items-center justify-center rounded-[var(--radius)] bg-primary text-sm font-bold text-primary-foreground"
              >
                {t('start')}
              </Link>
            </div>

            <div className="mt-10 text-left">
              <MedicalDisclaimer />
            </div>
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={t('title')}
        subtitle={t('planVersion', { version: plan.version })}
        trailing={
          <Link
            href="/meal-plan/onboarding"
            className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-[var(--radius)] border border-border px-3 text-xs font-semibold"
          >
            <SlidersHorizontal className="size-3.5" aria-hidden />
            {t('editProfile')}
          </Link>
        }
      />
      <main className="pb-2">
      <div className="bg-card px-4 py-4">

      {/* B8 / S3 — a flagged plan still displays. The banner and the disclaimer
          are the safeguard; the review queue is the second layer. */}
      {plan.flaggedForReview && (
        <div className="mb-4">
          <DoctorBanner />
        </div>
      )}

      {data?.profileChangedSincePlan && (
        <div className="mb-4 flex items-start gap-3 rounded-[var(--radius)] border border-border bg-secondary px-4 py-3">
          <RefreshCw className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-xs leading-relaxed">{t('profileChanged')}</p>
            <button
              type="button"
              onClick={() => regenerate.mutate(plan.id)}
              disabled={regenerate.isPending}
              className="mt-2 text-xs font-bold text-primary disabled:opacity-50"
            >
              {regenerate.isPending ? t('regenerating') : t('regenerate')}
            </button>
          </div>
        </div>
      )}

      {/* M6 — a running subscription puts the week first. What arrives
          tomorrow matters more than the template that produced it. */}
      {activeSubscription && week && (
        <>
          <div className="mb-4 flex items-center justify-between gap-3 rounded-[var(--radius)] bg-primary/5 px-4 py-3">
            <p className="text-xs">
              {tSub('activeUntil', { date: activeSubscription.endDate })}
              {' · '}
              {tSub('daysLeft', { count: activeSubscription.daysUntilEnd })}
            </p>
            <Link href="/subscription" className="shrink-0 text-xs font-bold text-primary">
              {tSub('manage')}
            </Link>
          </div>

          {/* M6 — the T-2 renewal prompt, on screen as well as by push. */}
          {activeSubscription.daysUntilEnd <= 2 && (
            <div className="mb-4 flex items-center justify-between gap-3 rounded-[var(--radius)] border border-warning/40 bg-[#FDF3E3] px-4 py-3">
              <p className="text-xs text-[#8A5A2B]">{tSub('renewSoon')}</p>
              <Link
                href={`/meal-plan/${plan.id}/approve`}
                className="shrink-0 text-xs font-bold text-[#8A5A2B]"
              >
                {tSub('renew')}
              </Link>
            </div>
          )}

          <div className="mb-6">
            <MyWeek
              subscriptionId={week.subscriptionId}
              days={week.days}
              todayKey={week.days[0]?.dateKey ?? ''}
            />
          </div>
        </>
      )}

      {plan.overallNote && (
        <p className="mb-4 rounded-[var(--radius)] bg-primary/5 px-4 py-3 text-sm leading-relaxed">
          {plan.overallNote}
        </p>
      )}

      {/* B6 — swapping is offered while the plan is still the customer's to
          shape. Once it is ACTIVE the subscription is running against it, and
          changing tomorrow's vegetables belongs to Phase 6's My Week screen. */}
      <PlanWeekView
        days={plan.days}
        mealPlanId={plan.id}
        swappable={plan.status === 'PENDING_CUSTOMER'}
        onSwapped={() => {
          void queryClient.invalidateQueries({ queryKey: ['meal-plan-current'] });
        }}
      />

      {/* B2 — the approval screen shows an estimated daily cost and says plainly
          that prices move. The full period total and prepay land in Phase 5. */}
      <section className="mt-5 rounded-[var(--radius)] border border-border/60 bg-background p-4">
        <div className="flex items-baseline justify-between">
          <span className="text-sm text-muted-foreground">{t('estimatedDaily')}</span>
          <span className="text-lg font-bold">
            {formatPaise(paise(plan.estimatedDailyCostPaise))}
          </span>
        </div>
        <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
          {t('priceVaries')}
        </p>
      </section>

      {/* R6 — when the model failed twice and the deterministic generator
          produced this, say so rather than implying an AI wrote it. */}
      {plan.aiProvider === 'rule-based' && (
        <p className="mt-3 text-center text-[11px] text-muted-foreground">{t('ruleBasedNote')}</p>
      )}

      {error && (
        <p className="mt-4 rounded-[var(--radius)] bg-danger/10 px-3 py-2.5 text-sm text-danger">
          {error}
        </p>
      )}

      <div className="mt-5 flex gap-3">
        <button
          type="button"
          onClick={() => regenerate.mutate(plan.id)}
          disabled={regenerate.isPending}
          className="flex h-12 flex-1 items-center justify-center gap-2 rounded-[var(--radius)] border border-border text-sm font-semibold disabled:opacity-50"
        >
          {regenerate.isPending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <RefreshCw className="size-4" aria-hidden />
          )}
          {t('regenerate')}
        </button>

        <Link
          href={`/meal-plan/${plan.id}/approve`}
          className={cn(
            'flex h-12 flex-1 items-center justify-center rounded-[var(--radius)] bg-primary text-sm font-bold text-primary-foreground',
            plan.status !== 'PENDING_CUSTOMER' && 'pointer-events-none opacity-50',
          )}
        >
          {t('approve')}
        </Link>
      </div>
      <p className="mt-2 text-center text-[11px] text-muted-foreground">
        {t('approveComingSoon')}
      </p>

      <div className="mt-6">
        <MedicalDisclaimer />
      </div>
      </div>
      </main>
    </>
  );
}
