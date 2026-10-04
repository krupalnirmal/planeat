import { setRequestLocale } from 'next-intl/server';
import { VendorDashboard } from '@/components/vendor/dashboard';

export default async function VendorPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <VendorDashboard />;
}
