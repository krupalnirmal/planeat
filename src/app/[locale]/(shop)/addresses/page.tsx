import { setRequestLocale } from 'next-intl/server';
import { AddressManager } from '@/components/shop/address-manager';

/** M1 — multiple saved addresses, exactly one default. */
export default async function AddressesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <AddressManager />;
}
