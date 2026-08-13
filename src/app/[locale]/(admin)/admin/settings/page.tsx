import { setRequestLocale } from 'next-intl/server';
import { AdminSettingsScreen } from '@/components/admin/settings-screen';

/** M9 admin section. RBAC is enforced by the layout and by every API route. */
export default async function AdminSectionPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <AdminSettingsScreen />;
}