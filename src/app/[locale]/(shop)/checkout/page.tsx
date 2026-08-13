import { setRequestLocale } from 'next-intl/server';
import { CheckoutScreen } from '@/components/shop/checkout-screen';

/** Checkout (M3). */
export default async function CheckoutPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <CheckoutScreen />;
}
