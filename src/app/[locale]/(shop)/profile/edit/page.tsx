import { setRequestLocale } from 'next-intl/server';
import { ProfileEditScreen } from '@/components/shop/profile-edit-screen';

export default async function ProfileEditPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <ProfileEditScreen />;
}
