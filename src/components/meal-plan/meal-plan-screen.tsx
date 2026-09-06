'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Salad } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { LoginPrompt } from '@/components/shop/login-prompt';
import { PageHeader } from '@/components/shop/page-header';
import { useSession } from '@/hooks/use-session';
import { ApiClientError, api, qs } from '@/lib/api/client';
import { type InitialPlanDay, type PlanColumn, type SavePlanDay, PlanTable } from './plan-table';

/**
 * The My Meal Plan tab (M5) — rebuilt (session 2026-08-30) as a manual
 * weekly product picker. No AI, no health profile, no plan-type choice, no
 * subscription conversion: the customer taps real products straight into a
 * day × category table and saves. Always shows the same editable table,
 * pre-filled from whatever was last saved — there's no separate read-only
 * view to fall back to.
 */

interface PlanResponse {
  plan: { id: string; days: InitialPlanDay[] } | null;
  columns: PlanColumn[];
}

export function MealPlanScreen() {
  const t = useTranslations('mealPlan');
  const tc = useTranslations('common');
  const te = useTranslations('errors');
  const locale = useLocale();
  const queryClient = useQueryClient();
  const { isLoggedIn, isLoading: sessionLoading } = useSession();
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const current = useQuery({
    queryKey: ['meal-plan-current', locale],
    queryFn: () => api.get<PlanResponse>(`/api/meal-plan/current${qs({ locale })}`),
    enabled: isLoggedIn,
  });

  const save = useMutation({
    mutationFn: (days: SavePlanDay[]) =>
      api.put<{ plan: PlanResponse['plan'] }>(`/api/meal-plan/current${qs({ locale })}`, { days }),
    onSuccess: (data) => {
      queryClient.setQueryData<PlanResponse | undefined>(['meal-plan-current', locale], (prev) =>
        prev ? { ...prev, plan: data.plan } : prev,
      );
      setSaveError(null);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    },
    // Session 2026-09-06: this used to have no onError at all, so a failed
    // save (previously: a payload the server's schema rejected outright)
    // looked identical to a successful one — nothing told the customer their
    // picks hadn't actually been kept.
    onError: (err) => {
      setSaveError(err instanceof ApiClientError ? err.message : te('generic'));
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

  // B17 — a login is required before building a plan.
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

  return (
    <>
      <PageHeader title={t('title')} subtitle={t('subtitle')} />
      <main className="pb-2">
        <div className="bg-card px-4 py-4">
          <p className="mb-4 text-xs leading-relaxed text-muted-foreground">{t('builder.hint')}</p>
          {saveError && (
            <p className="mb-4 rounded-[var(--radius)] bg-[#FDF3E3] px-3 py-2.5 text-sm text-warning">
              {saveError}
            </p>
          )}
          {/* A real `key`, not a prop — remounts PlanTable (and its internal
              selections state) once the fetched plan's identity actually
              changes, so a stale first render can never lock in against
              in-progress edits. */}
          <PlanTable
            key={data?.plan?.id ?? 'new'}
            columns={data?.columns ?? []}
            initialDays={data?.plan?.days}
            onSave={(days) => save.mutate(days)}
            saving={save.isPending}
            saved={saved}
          />
        </div>
      </main>
    </>
  );
}
