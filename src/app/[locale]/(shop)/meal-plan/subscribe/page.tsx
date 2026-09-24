import { Suspense } from 'react';
import { setRequestLocale } from 'next-intl/server';
import { SubscribeScreen } from '@/components/meal-plan/subscribe-screen';

/** Phase 5 — turning a saved "My Meal Plan" into a real subscription. */
export default async function MealPlanSubscribePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  // `Suspense` (session 2026-09-25) — `SubscribeScreen` now reads the
  // `?mode=` query param via `useSearchParams`, which Next.js requires a
  // Suspense boundary for.
  return (
    <Suspense fallback={null}>
      <SubscribeScreen />
    </Suspense>
  );
}
