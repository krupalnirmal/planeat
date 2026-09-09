import { setRequestLocale } from 'next-intl/server';
import { MealPlanScreen } from '@/components/meal-plan/meal-plan-screen';

/**
 * My Meal Plan (M5).
 *
 * Client-rendered: it is entirely per-customer state, and the plan is fetched
 * behind a login anyway. Approval (turning a saved plan into a real,
 * wallet-billed subscription) lives at `/meal-plan/subscribe`. Swaps are
 * still a later phase.
 */
export default async function MealPlanPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <MealPlanScreen />;
}
