import { setRequestLocale } from 'next-intl/server';
import { WeeklySummaryScreen } from '@/components/meal-plan/weekly-summary-screen';

export default async function MealPlanBuildSummaryPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <WeeklySummaryScreen />;
}
