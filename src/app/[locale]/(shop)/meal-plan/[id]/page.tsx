import { setRequestLocale } from 'next-intl/server';
import { MealPlanScreen } from '@/components/meal-plan/meal-plan-screen';

/**
 * A specific plan version.
 *
 * Currently renders the same screen as `/meal-plan`, which shows the customer's
 * live plan — the id in the URL is what the wizard redirects to after
 * generation, so landing here immediately after building a plan shows exactly
 * that plan. Phase 5 gives this route its own approval flow, at which point it
 * reads `/api/meal-plan/:id` directly.
 */
export default async function MealPlanVersionPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <MealPlanScreen />;
}
