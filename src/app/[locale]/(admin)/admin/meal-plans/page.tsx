import { setRequestLocale } from 'next-intl/server';
import { AdminMealPlansScreen } from '@/components/admin/meal-plans-screen';

/** M9 admin section. RBAC is enforced by the layout and by every API route. */
export default async function AdminSectionPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <AdminMealPlansScreen />;
}