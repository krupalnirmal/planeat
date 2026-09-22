'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { ChevronDown, MapPin, Package, ShoppingCart, UserRound, Wallet } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Link, useRouter } from '@/i18n/navigation';
import { SearchBar } from '@/components/shop/search-bar';
import { useCart } from '@/hooks/use-cart';
import { useInvalidateSession, useSession } from '@/hooks/use-session';
import { api } from '@/lib/api/client';
import { formatPaise, paise } from '@/lib/money';
import { useDeliveryArea } from '@/stores/delivery-area';

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
 *
 * Gained a utility bar, a location selector, and a real account dropdown
 * (session 2026-09-22, new client reference — the reference's own desktop
 * header has all three, and this one had none). The utility bar's copy is
 * this app's own real tagline, not the reference's "Delivering freshness
 * to 100+ cities" — this is a single-city (Nashik) operation, and that
 * claim would be false. "Track Order" is real (→ /orders); the
 * reference's "Help" and "Become a Partner" were dropped — investigation
 * confirmed neither has a real destination anywhere in the app (no
 * support contact, no customer-facing partner-signup flow).
 */
export function DesktopHeader({ categories }: { categories: { slug: string; name: string }[] }) {
  const t = useTranslations('home');
  const tCart = useTranslations('cart');
  const tp = useTranslations('profile');
  const { user, isLoggedIn, defaultAddress } = useSession();
  const cart = useCart();
  const router = useRouter();
  const invalidateSession = useInvalidateSession();
  const rememberedArea = useDeliveryArea((s) => s.areaName ?? s.pincode);
  const [accountOpen, setAccountOpen] = useState(false);

  // Shares the ['wallet'] key with AppHeader/the wallet screen, so a
  // top-up updates the chip without a second request.
  const wallet = useQuery({
    queryKey: ['wallet'],
    queryFn: () => api.get<{ balancePaise: string }>('/api/wallet'),
    enabled: isLoggedIn,
    staleTime: 30_000,
  });

  const logout = useMutation({
    mutationFn: () => api.post('/api/auth/logout'),
    onSuccess: async () => {
      await invalidateSession();
      setAccountOpen(false);
      router.replace('/');
    },
  });

  // Same "a real saved address always wins, a merely-checked area is still
  // worth showing" rule `app-header.tsx`'s own mobile address row already
  // uses — reused verbatim rather than a second convention.
  const addressLine = defaultAddress
    ? `${defaultAddress.label} · ${defaultAddress.line1}`
    : (rememberedArea ?? t('selectAddress'));

  const initial = user?.name?.trim().charAt(0);

  return (
    <>
      <div className="hidden border-b border-border bg-tint-green lg:block">
        <div className="mx-auto flex max-w-[1280px] items-center justify-between px-8 py-1.5 text-xs">
          <p className="font-medium text-primary-dark">{t('tagline')}</p>
          <Link href="/orders" className="font-semibold text-primary-dark hover:underline">
            {t('trackOrder')}
          </Link>
        </div>
      </div>

      <header className="sticky top-0 z-30 hidden border-b border-border bg-card lg:block">
        <div className="mx-auto flex max-w-[1280px] items-center gap-6 px-8 py-3">
          {/* Real logo (session 2026-09-22) — see this file's own doc
              comment. */}
          <Link href="/" className="flex shrink-0 items-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/logo-compact.png" alt="getFresh" className="h-9 w-auto" />
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

          {/* Location selector (session 2026-09-22) — same real address
              source as the mobile header's own "Deliver to" row. */}
          <Link
            href={user ? '/addresses' : '/serviceability'}
            className="flex min-w-0 shrink-0 items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-semibold"
          >
            <MapPin className="size-3.5 shrink-0 text-primary" aria-hidden />
            <span className="max-w-[140px] truncate">{addressLine}</span>
            <ChevronDown className="size-3 shrink-0 text-muted-foreground" aria-hidden />
          </Link>

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

            {/* Real account dropdown (session 2026-09-22) — was a plain
                icon link straight to /profile. Logged out, it's still just
                a login link; logged in, it's the real name/My Orders/
                Logout — the exact same logout mutation
                profile-screen.tsx's own button already calls. */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setAccountOpen((o) => !o)}
                aria-expanded={accountOpen}
                aria-label={tp('title')}
                className="flex items-center gap-1 rounded-full py-1 pr-1.5 pl-1 hover:bg-secondary"
              >
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-secondary text-sm font-bold text-foreground">
                  {initial || <UserRound className="size-4.5" aria-hidden />}
                </span>
                <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
              </button>

              {accountOpen && (
                <>
                  <button
                    type="button"
                    aria-label={tp('title')}
                    className="fixed inset-0 z-40"
                    onClick={() => setAccountOpen(false)}
                  />
                  <div className="absolute top-full right-0 z-50 mt-1 w-48 rounded-[var(--radius)] border border-border bg-card py-1 shadow-lg">
                    {isLoggedIn ? (
                      <>
                        <p className="truncate px-3 py-1.5 text-xs font-semibold text-muted-foreground">
                          {user?.name ?? user?.phone}
                        </p>
                        <Link
                          href="/profile"
                          onClick={() => setAccountOpen(false)}
                          className="block px-3 py-2 text-sm hover:bg-secondary"
                        >
                          {tp('title')}
                        </Link>
                        <Link
                          href="/orders"
                          onClick={() => setAccountOpen(false)}
                          className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-secondary"
                        >
                          <Package className="size-4 shrink-0" aria-hidden />
                          {tp('myOrders')}
                        </Link>
                        <button
                          type="button"
                          onClick={() => logout.mutate()}
                          disabled={logout.isPending}
                          className="flex w-full items-center px-3 py-2 text-left text-sm text-danger hover:bg-secondary"
                        >
                          {tp('logout')}
                        </button>
                      </>
                    ) : (
                      <Link
                        href="/login"
                        onClick={() => setAccountOpen(false)}
                        className="block px-3 py-2 text-sm font-semibold text-primary hover:bg-secondary"
                      >
                        {tp('login')}
                      </Link>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </header>
    </>
  );
}
