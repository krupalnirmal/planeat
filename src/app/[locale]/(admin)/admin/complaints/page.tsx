import { setRequestLocale } from 'next-intl/server';
import { AdminComplaintsScreen } from '@/components/admin/complaints-screen';

/** RBAC is enforced by the layout and by every API route. */
export default async function AdminComplaintsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <AdminComplaintsScreen />;
}
