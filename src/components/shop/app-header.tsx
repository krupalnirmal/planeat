'use client';

import { useQuery } from '@tanstack/react-query';
import { ChevronDown, Leaf, MapPin, ShoppingCart, Wallet } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { SearchBar } from '@/components/shop/search-bar';
import { useCart } from '@/hooks/use-cart';
import { useSession } from '@/hooks/use-session';
import { api } from '@/lib/api/client';
import { formatPaise, paise } from '@/lib/money';

/**
 * PART 5 — the sticky home header: wordmark, delivery address, wallet
 * balance chip and profile avatar.
 *
 * A direct copy of the client's own reference: NO coloured band. The logo,
 * address row and search bar all sit on the same soft cream as the rest of
 * the page — colour is spent on the welcome banner and the buttons below,
 * not on a header competing with them (D-198).
 *
 * The wallet chip is still zero for a guest: the ledger only has something to
 * show once someone is logged in and has topped up. Everything else is live.
 */
export function AppHeader() {
  const t = useTranslations('home');
  const tp = useTranslations('profile');
  const tw = useTranslations('wallet');
  const tCart = useTranslations('cart');
  const { user, defaultAddress, isLoggedIn } = useSession();
  const cart = useCart();

  // Shares the ['wallet'] key with the wallet screen, so a top-up updates the
  // chip without a second request.
  const wallet = useQuery({
    queryKey: ['wallet'],
    queryFn: () => api.get<{ balancePaise: string }>('/api/wallet'),
    enabled: isLoggedIn,
    staleTime: 30_000,
  });

  const addressLine = defaultAddress
    ? `${defaultAddress.label} · ${defaultAddress.line1}`
    : t('selectAddress');

  const initial = user?.name?.trim().charAt(0) || 'आ';

  return (
    // White, so the header and the banner panel beneath it read as one block
    // at the top of the stack rather than a grey strip above a white one.
    <header className="sticky top-0 z-30 bg-card px-4 pt-3 pb-3">
      <div className="flex items-center justify-between gap-3">
        {/* The wordmark itself carries the brand colour — a leaf mark and a
            two-tone "Plan" / "eat", exactly as the client's logo sheet does.
            "Plan" and "eat" are brand-name fragments, not content (R7 governs
            translatable text, not a wordmark that is identical in mr/hi/en —
            see D-196/`app.name`'s SHARED_LATIN_KEYS exemption). */}
        <div className="flex min-w-0 items-center gap-1">
          <Leaf className="size-6 shrink-0 -rotate-12 text-primary" aria-hidden />
          <p className="truncate text-2xl font-black tracking-tight">
            <span className="text-primary-dark">Plan</span>
            <span className="text-primary">eat</span>
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Link
            href="/wallet"
            aria-label={tw('title')}
            className="relative grid size-11 place-items-center rounded-full bg-card text-foreground shadow-sm"
          >
            <Wallet className="size-[18px]" aria-hidden />
            {/* The balance rides under the icon as its own chip, the way the
                reference does — a number glanced at, not a button read. */}
            <span className="absolute -bottom-1.5 rounded-full bg-primary px-1.5 text-[10px] leading-[15px] font-bold text-primary-foreground">
              {formatPaise(paise(wallet.data?.balancePaise ?? '0'), { hidePaise: true })}
            </span>
          </Link>

          <Link
            href="/cart"
            aria-label={tCart('title')}
            className="relative grid size-11 place-items-center rounded-full bg-primary-dark text-white"
          >
            <ShoppingCart className="size-[18px]" aria-hidden />
            {cart.itemCount > 0 && (
              <span className="absolute -top-1 -right-1 grid min-w-5 place-items-center rounded-full bg-accent px-1 text-[10px] font-bold text-accent-foreground">
                {cart.itemCount}
              </span>
            )}
          </Link>

          <Link
            href="/profile"
            aria-label={tp('title')}
            className="grid size-11 place-items-center rounded-full bg-primary-dark text-sm font-semibold text-white"
          >
            {initial}
          </Link>
        </div>
      </div>

      <Link
        href={user ? '/addresses' : '/serviceability'}
        className="mt-2.5 flex max-w-full items-center gap-1.5 text-left"
      >
        <MapPin className="size-4 shrink-0 text-primary" aria-hidden />
        <span className="text-[13px] text-muted-foreground">{t('deliverTo')}</span>
        <span className="truncate text-[13px] font-bold">{addressLine}</span>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      </Link>

      <SearchBar showMic className="mt-3" />
    </header>
  );
}
