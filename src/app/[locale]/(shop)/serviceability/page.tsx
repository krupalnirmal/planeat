import { setRequestLocale } from 'next-intl/server';
import { Suspense } from 'react';
import { ServiceabilityCheck } from '@/components/shop/serviceability-check';

/**
 * M1 — the serviceability gate and the waitlist behind it.
 *
 * B11: a non-serviceable customer is not a dead end. Their phone and pincode
 * go on the waitlist, and the admin dashboard groups that demand by pincode —
 * which is how the owner decides where to expand next.
 */
export default async function ServiceabilityPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <Suspense fallback={<div className="px-5 py-8" />}>
      <ServiceabilityCheck />
    </Suspense>
  );
}
