import { setRequestLocale } from 'next-intl/server';
import { SplashScreen } from '@/components/auth/splash-screen';

export default async function SplashPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <SplashScreen />;
}
