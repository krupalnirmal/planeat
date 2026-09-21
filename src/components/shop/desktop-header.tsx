'use client';

import { useQuery } from '@tanstack/react-query';
import { Leaf, ShoppingCart, UserRound, Wallet } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { SearchBar } from '@/components/shop/search-bar';
import { useCart } from '@/hooks/use-cart';
import { useSession } from '@/hooks/use-session';
import { api } from '@/lib/api/client';
import { formatPaise, paise } from '@/lib/money';

/**
 * Desktop chrome (session 2026-09-20, client request — "the desktop view
 * looks identical to mobile, design a real one"): a persistent top bar
 * replacing `AppHeader` + `BottomNav` + `CartBar` at `lg:` and up. Mobile
 * itself is untouched — this renders `hidden lg:flex`, exactly the same
 * pattern `admin-shell.tsx` already uses to swap its own mobile header for
 * a desktop one.
 *
 * `categories` comes in as a prop from `(shop)/layout.tsx` (a server
 * component, via the already-existing `getCategories()`) rather than a
 * second client-side fetch — this header renders on every single page in
 * the app, so it reuses data the layout already has instead of adding its
 * own query.
 *
 * Deliberately does not open a cart drawer — the cart icon just links to
 * the existing `/cart` page (reflowed for desktop separately). A slide-
 * over is a real, separate piece of new interactive surface this change
 * doesn't need to also take on.
 */
export function DesktopHeader({ categories }: { categories: { slug: string; name: string }[] }) {
  const t = useTranslations('home');
  const tCart = useTranslations('cart');
  const tp = useTranslations('profile');
  const { user, isLoggedIn } = useSession();
  const cart = useCart();

  // Shares the ['wallet'] key with AppHeader/the wallet screen, so a
  // top-up updates the chip without a second request.
  const wallet = useQuery({
    queryKey: ['wallet'],
    queryFn: () => api.get<{ balancePaise: string }>('/api/wallet'),
    enabled: isLoggedIn,
    staleTime: 30_000,
  });

  const initial = user?.name?.trim().charAt(0);

  return (
    <header className="sticky top-0 z-30 hidden border-b border-border bg-card lg:block">
      <div className="mx-auto flex max-w-[1280px] items-center gap-6 px-8 py-3">
        <Link href="/" className="flex shrink-0 items-center gap-1">
          <Leaf className="size-6 shrink-0 -rotate-12 text-primary" aria-hidden />
          <span className="text-xl font-black tracking-tight">
            <span className="text-primary-dark">Get</span> <span className="text-primary">Freesh</span>
          </span>
        </Link>

        <nav aria-label={t('categories')} className="flex shrink-0 items-center gap-5">
          {categories.map((category) => (
            <Link
              key={category.slug}
              href={`/category/${category.slug}`}
              className="text-sm font-semibold text-foreground hover:text-primary"
            >
              {category.name}
            </Link>
          ))}
        </nav>

        <SearchBar showMic className="max-w-xl flex-1" />

        <div className="flex shrink-0 items-center gap-2">
          <Link
            href="/wallet"
            className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-sm font-bold text-primary"
          >
            <Wallet className="size-4 shrink-0" aria-hidden />
            {formatPaise(paise(wallet.data?.balancePaise ?? '0'), { hidePaise: true })}
          </Link>

          <Link
            href="/cart"
            aria-label={tCart('title')}
            className="relative grid size-10 shrink-0 place-items-center rounded-full text-foreground"
          >
            <ShoppingCart className="size-5" aria-hidden />
            {cart.itemCount > 0 && (
              <span className="absolute top-0 right-0 grid size-4 place-items-center rounded-full bg-accent text-[9px] font-bold text-accent-foreground">
                {cart.itemCount > 9 ? '9+' : cart.itemCount}
              </span>
            )}
          </Link>

          <Link
            href="/profile"
            aria-label={tp('title')}
            className="grid size-10 shrink-0 place-items-center rounded-full bg-secondary text-sm font-bold text-foreground"
          >
            {initial || <UserRound className="size-5" aria-hidden />}
          </Link>
        </div>
      </div>
    </header>
  );
}
