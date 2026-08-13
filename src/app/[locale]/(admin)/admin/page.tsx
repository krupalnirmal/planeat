import { setRequestLocale } from 'next-intl/server';
import { AdminDashboard } from '@/components/admin/dashboard-screen';

/** M9 dashboard. B8's flagged count and M6's cron health sit at the top. */
export default async function AdminDashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <AdminDashboard />;
}
