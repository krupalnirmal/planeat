import { setRequestLocale } from 'next-intl/server';
import { CartScreen } from '@/components/shop/cart-screen';

/** Cart (M3). Client-rendered — it is entirely per-user, mutable state. */
export default async function CartPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <CartScreen />;
}
