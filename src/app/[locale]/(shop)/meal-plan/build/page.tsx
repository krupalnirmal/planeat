import { setRequestLocale } from 'next-intl/server';
import { DayListScreen } from '@/components/meal-plan/day-list-screen';

export default async function MealPlanBuildPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <DayListScreen />;
}
