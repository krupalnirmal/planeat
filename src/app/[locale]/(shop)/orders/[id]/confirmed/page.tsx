import { setRequestLocale } from 'next-intl/server';
import { OrderConfirmedScreen } from '@/components/shop/order-confirmed-screen';

export default async function OrderConfirmedPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  return <OrderConfirmedScreen orderId={id} />;
}
