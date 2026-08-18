import { setRequestLocale } from 'next-intl/server';
import { OnboardingFlow } from '@/components/meal-plan/onboarding-flow';
import { pickName } from '@/lib/catalog/text';
import { db } from '@/lib/db';
import type { AppLocale } from '@/i18n/routing';

/**
 * "Make My Meal Plan" — full AI-driven flow (session 2026-08-18, per the
 * client's requirement doc). Terms gate → plan type → Personal/Family
 * intake → AI-generated day-by-day options → final preview → real
 * MealPlan. The old single-pick AI wizard (`intake-wizard.tsx`'s own
 * `/api/meal-plan/generate` call) is superseded, not deleted — its form UI
 * is reused here for Personal-plan intake, just pointed at the new
 * options-generation endpoint.
 */
export default async function MealPlanOnboardingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  // A curated "which of these don't you want" picker for the intake forms —
  // real, in-stock, meal-plan-eligible products only (same discipline as
  // the candidate list the AI itself is given).
  const products = await db.product.findMany({
    where: { isActive: true, isMealPlanEligible: true, variants: { some: { isActive: true, stockQty: { gt: 0 } } } },
    orderBy: [{ sortOrder: 'asc' }],
    take: 24,
    select: { id: true, nameEn: true, nameMr: true, nameHi: true },
  });

  const dislikeOptions = products.map((product) => ({
    id: product.id,
    name: pickName(product, locale as AppLocale),
  }));

  return <OnboardingFlow dislikeOptions={dislikeOptions} />;
}
