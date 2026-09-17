import { setRequestLocale } from 'next-intl/server';
import { Suspense } from 'react';
import { LoginFlow } from '@/components/auth/login-flow';

export default async function StaffLoginPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <Suspense fallback={<div className="px-6 py-8" />}>
      <LoginFlow variant="staff" />
    </Suspense>
  );
}
