import { setRequestLocale } from 'next-intl/server';
import { SmartListScreen } from '@/components/smart-list/smart-list-screen';

/** Smart List (M4): speak it, photograph it, or type it. */
export default async function SmartListPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <SmartListScreen />;
}
