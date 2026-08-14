import { setRequestLocale } from 'next-intl/server';
import { Suspense } from 'react';
import { LoginFlow } from '@/components/auth/login-flow';

export default async function LoginPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  // The `?next=` parameter is read with `useSearchParams`, which needs a
  // Suspense boundary to stay prerenderable.
  return (
    <Suspense fallback={<div className="px-6 py-8" />}>
      <LoginFlow />
    </Suspense>
  );
}
