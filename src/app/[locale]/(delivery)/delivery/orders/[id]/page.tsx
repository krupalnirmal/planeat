import { setRequestLocale } from 'next-intl/server';
import { DeliveryOrderDetail } from '@/components/delivery/order-detail';

/** M10 — order detail: customer, address, map link, item checklist, status actions. */
export default async function DeliveryOrderPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  return <DeliveryOrderDetail orderId={id} />;
}
