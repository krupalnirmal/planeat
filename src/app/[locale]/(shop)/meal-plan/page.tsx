import { setRequestLocale } from 'next-intl/server';
import { MealPlanScreen } from '@/components/meal-plan/meal-plan-screen';

/**
 * My Meal Plan (M5).
 *
 * Client-rendered: it is entirely per-customer state, and the plan is fetched
 * behind a login anyway. Swaps and approval arrive in Phase 5.
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
