import { setRequestLocale } from 'next-intl/server';
import { Suspense } from 'react';
import { LoginFlow } from '@/components/auth/login-flow';
import { getLoginCollageImages } from '@/lib/catalog/queries';

export default async function LoginPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  // The product wall behind the login card. Read on the server from the real
  // catalogue rather than hard-coded paths, so it cannot drift out of sync
  // with what the shop actually stocks. A fresh clone with no database simply
  // gets no wall, which is the same graceful-empty rule the home page follows.
  let images: string[] = [];
  try {
    images = await getLoginCollageImages();
  } catch {
    images = [];
  }

  // The `?next=` parameter is read with `useSearchParams`, which needs a
  // Suspense boundary to stay prerenderable.
  return (
    <Suspense fallback={<div className="px-5 py-8" />}>
      <LoginFlow collageImages={images} />
    </Suspense>
  );
}
