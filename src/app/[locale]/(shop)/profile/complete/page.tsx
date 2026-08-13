import { setRequestLocale } from 'next-intl/server';
import { Suspense } from 'react';
import { ProfileForm } from '@/components/auth/profile-form';

/** M1 — the profile step new users land on straight after OTP verification. */
export default async function CompleteProfilePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <Suspense fallback={<div className="px-5 py-8" />}>
      <ProfileForm />
    </Suspense>
  );
}
