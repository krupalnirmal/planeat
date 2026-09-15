import { notFound } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { DayBuilderScreen } from '@/components/meal-plan/day-builder-screen';

export default async function MealPlanBuildDayPage({
  params,
}: {
  params: Promise<{ locale: string; day: string }>;
}) {
  const { locale, day } = await params;
  setRequestLocale(locale);

  const dayOfWeek = Number(day);
  if (!Number.isInteger(dayOfWeek) || dayOfWeek < 1 || dayOfWeek > 7) notFound();

  return <DayBuilderScreen dayOfWeek={dayOfWeek} />;
}
