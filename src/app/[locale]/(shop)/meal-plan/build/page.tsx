import { setRequestLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';

/**
 * The standalone "pick a day" screen (`DayListScreen`) was dropped (session
 * 2026-09-27, user report — the week-view grid it showed duplicated the
 * summary screen right after it, confusing users who saw "View Plan" twice
 * in a row for what looked like the same list). `/meal-plan/build/summary`
 * (`WeeklySummaryScreen`) already lets a customer tap any day straight into
 * the builder and shows the same day-tile grid, so it now doubles as the
 * wizard's entry point too — this route is just a redirect to it, kept
 * around so any existing link/bookmark to `/meal-plan/build` still lands
 * somewhere real.
 */
export default async function MealPlanBuildPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  redirect({ href: '/meal-plan/build/summary', locale });
}
