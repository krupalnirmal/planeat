import { setRequestLocale } from 'next-intl/server';
import { ProfileScreen } from '@/components/shop/profile-screen';

/** Profile & settings (M11 shell; M1 owns the account rows). */
export default async function ProfilePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <ProfileScreen />;
}
