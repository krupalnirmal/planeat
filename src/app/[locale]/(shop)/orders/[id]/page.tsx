import { setRequestLocale } from 'next-intl/server';
import { Suspense } from 'react';
import { OrderDetail } from '@/components/shop/order-detail';

/** Order detail (M3): status timeline, items, bill, cancel, report an issue. */
export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  return (
    <Suspense fallback={<div className="px-4 py-8" />}>
      <OrderDetail orderId={id} />
    </Suspense>
  );
}
