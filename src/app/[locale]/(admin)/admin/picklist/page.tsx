import { setRequestLocale } from 'next-intl/server';
import { PicklistScreen } from '@/components/admin/picklist-screen';

/**
 * M9's starred screen — "the highest-value screen; this replaces the owner's
 * notebook."
 */
export default async function AdminPicklistPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <PicklistScreen />;
}
