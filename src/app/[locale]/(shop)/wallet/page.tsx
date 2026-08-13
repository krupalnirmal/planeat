import { setRequestLocale } from 'next-intl/server';
import { WalletScreen } from '@/components/wallet/wallet-screen';

/**
 * Wallet (M7).
 *
 * R4 — the balance shown here is always derived by summing the append-only
 * `wallet_transactions` ledger. There is no balance column to drift.
 */
export default async function WalletPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <WalletScreen />;
}
