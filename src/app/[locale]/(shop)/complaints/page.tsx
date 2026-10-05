import { setRequestLocale } from 'next-intl/server';
import { ComplaintsScreen } from '@/components/shop/complaints-screen';

/** General complaint/feedback (session 2026-10-05). */
export default async function ComplaintsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <ComplaintsScreen />;
}
