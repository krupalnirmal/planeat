import { setRequestLocale } from 'next-intl/server';
import { OnboardingFlow } from '@/components/meal-plan/onboarding-flow';

/**
 * "Make My Meal Plan" (D-204): terms gate, then the day-by-day base-plan
 * picker. The AI-personalised intake wizard this replaced as the default
 * entry point (`intake-wizard.tsx`) still exists, unlinked, for a future
 * paid nutritionist tier.
 */
export default async function MealPlanOnboardingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <OnboardingFlow />;
}
