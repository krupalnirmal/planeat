import { setRequestLocale } from 'next-intl/server';
import { DeliveryDashboard } from '@/components/delivery/dashboard';

/** Rider home (M10): today's assigned orders sorted by slot. */
export default async function DeliveryHomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <DeliveryDashboard />;
}
