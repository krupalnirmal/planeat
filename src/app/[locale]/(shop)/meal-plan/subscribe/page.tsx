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

  return <SubscribeScreen />;
}
