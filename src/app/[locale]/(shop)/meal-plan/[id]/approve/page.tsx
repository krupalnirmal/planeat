import { setRequestLocale } from 'next-intl/server';
import { ApprovalScreen } from '@/components/meal-plan/approval-screen';

/**
 * M5 approval (B2, B3, B5).
 *
 * Duration and start date, the delivery slot, the address, the full cost
 * breakdown, and the wallet prepayment that turns the plan into a running
 * subscription.
 */
export default async function ApproveMealPlanPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  return <ApprovalScreen mealPlanId={id} />;
}
