import { setRequestLocale } from 'next-intl/server';
import { IntakeWizard } from '@/components/meal-plan/intake-wizard';
import { pickName } from '@/lib/catalog/text';
import { db } from '@/lib/db';
import type { AppLocale } from '@/i18n/routing';

/**
 * M5 — the intake wizard.
 *
 * The dislike options are loaded on the server: the customer is picking from
 * the real meal-plan-eligible catalogue, so the list is exactly what the plan
 * can draw from (B13).
 */
export default async function MealPlanOnboardingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  let dislikeOptions: Array<{ id: string; name: string }> = [];

  try {
    const products = await db.product.findMany({
      where: { isActive: true, isMealPlanEligible: true },
      orderBy: [{ sortOrder: 'asc' }, { nameEn: 'asc' }],
      take: 40,
      select: { id: true, nameEn: true, nameMr: true, nameHi: true },
    });
    dislikeOptions = products.map((product) => ({
      id: product.id,
      name: pickName(product, locale as AppLocale),
    }));
  } catch {
    // No database yet — the wizard still works; the dislike step is simply
    // empty rather than the whole page failing.
    dislikeOptions = [];
  }

  return <IntakeWizard dislikeOptions={dislikeOptions} />;
}
