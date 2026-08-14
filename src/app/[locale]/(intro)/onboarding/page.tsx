import { setRequestLocale } from 'next-intl/server';
import { OnboardingScreen } from '@/components/auth/onboarding-screen';

export default async function OnboardingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <OnboardingScreen />;
}
