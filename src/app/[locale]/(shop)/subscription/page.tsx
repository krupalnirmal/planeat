import { setRequestLocale } from 'next-intl/server';
import { SubscriptionManageScreen } from '@/components/subscription/manage-screen';

/** M6 — pause, resume, cancel, and change the address for future deliveries. */
export default async function SubscriptionPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <SubscriptionManageScreen />;
}
