'use client';

import { useQuery } from '@tanstack/react-query';
import { ChevronDown, MapPin, Search, ShoppingCart, UserRound, Wallet, Zap } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { useCart } from '@/hooks/use-cart';
import { useSession } from '@/hooks/use-session';
import { api } from '@/lib/api/client';
import { formatPaise, paise } from '@/lib/money';
import { useDeliveryArea } from '@/stores/delivery-area';

/**
 * PART 5 — the sticky home header: wordmark, three labelled icon buttons
 * (wallet, cart, profile), and a combined address/delivery-time/search row.
 *
 * Restyled (session 2026-08-26, client's reference): white header instead
 * of the cream band, icon buttons carry a small label under them instead of
 * being colour-filled circles, and the delivery-time promise now rides
 * alongside the address instead of only showing on individual product
 * cards. "Offers" in the reference has no page behind it yet in this app,
 * so the third icon stays Wallet — a real destination — rather than a link
 * to nothing.
 */
export function AppHeader() {
  const t = useTranslations('home');
  const tp = useTranslations('profile');
  const tw = useTranslations('wallet');
  const tCart = useTranslations('cart');
  const tSearch = useTranslations('search');
  const { user, defaultAddress, isLoggedIn } = useSession();
  const cart = useCart();
  const rememberedArea = useDeliveryArea((s) => s.areaName ?? s.pincode);

  // Shares the ['wallet'] key with the wallet screen, so a top-up updates the
  // chip without a second request.
  const wallet = useQuery({
    queryKey: ['wallet'],
    queryFn: () => api.get<{ balancePaise: string }>('/api/wallet'),
    enabled: isLoggedIn,
    staleTime: 30_000,
  });

  // A real saved address always wins; a merely-checked area (no login, or
  // logged in but never finished saving an address) is still worth showing
  // instead of a bare placeholder.
  const addressLine = defaultAddress
    ? `${defaultAddress.label} · ${defaultAddress.line1}`
    : (rememberedArea ?? t('selectAddress'));

  // A hardcoded Marathi letter here would show on the Hindi/English locales
  // too — a generic person icon (same fallback profile-screen.tsx already
  // uses) reads correctly everywhere instead.
  const initial = user?.name?.trim().charAt(0);

  return (
    // `lg:hidden` (session 2026-09-20) — `DesktopHeader` takes over at
    // `lg:` and up; this stays exactly as it was below that.
    <header className="sticky top-0 z-30 bg-card px-4 pt-3 pb-3 shadow-sm lg:hidden">
      <div className="flex items-start justify-between gap-3">
        {/* The real client-provided logo (session 2026-09-22) — was a
            styled text wordmark ("Get"/"Freesh" spans + a Leaf icon)
            standing in for the brand's actual logo file, which didn't
            exist in the app yet. "getFresh" is a brand-name image, not
            translatable content (R7 governs translatable text, not a
            wordmark — same reasoning the old text version's own comment
            already established, see D-196/`app.name`'s SHARED_LATIN_KEYS
            exemption). */}
        <div className="min-w-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/logo.png" alt="getFresh" className="h-20 w-auto" />
        </div>

        <div className="flex shrink-0 items-start gap-3">
          <Link href="/wallet" className="flex flex-col items-center gap-1">
            <span className="relative grid size-11 place-items-center rounded-full bg-card text-primary shadow-sm">
              <Wallet className="size-[18px]" aria-hidden />
              {/* The balance rides under the icon as its own chip, the way
                  the reference does — a number glanced at, not a button
                  read. */}
              <span className="absolute -bottom-1.5 rounded-full bg-primary px-1.5 text-[10px] leading-[15px] font-bold text-primary-foreground">
                {formatPaise(paise(wallet.data?.balancePaise ?? '0'), { hidePaise: true })}
              </span>
            </span>
            <span className="text-[10px] font-medium text-muted-foreground">{tw('title')}</span>
          </Link>

          <Link href="/cart" className="flex flex-col items-center gap-1">
            <span className="relative grid size-11 place-items-center rounded-full bg-card text-primary shadow-sm">
              <ShoppingCart className="size-[18px]" aria-hidden />
              {cart.itemCount > 0 && (
                <span className="absolute -top-1 -right-1 grid min-w-5 place-items-center rounded-full bg-accent px-1 text-[10px] font-bold text-accent-foreground">
                  {cart.itemCount}
                </span>
              )}
            </span>
            <span className="text-[10px] font-medium text-muted-foreground">{tCart('title')}</span>
          </Link>

          <Link href="/profile" className="flex flex-col items-center gap-1">
            <span className="grid size-11 place-items-center rounded-full bg-card text-primary shadow-sm">
              {initial || <UserRound className="size-5" aria-hidden />}
            </span>
            <span className="text-[10px] font-medium text-muted-foreground">{tp('title')}</span>
          </Link>
        </div>
      </div>

      {/* The address, the delivery promise, and search share one row
          (session 2026-09-23, client request — was two stacked rows) — the
          address stacked as a quiet label over a bold value, the promise as
          a tinted pill, and search collapsed to a real icon-button link
          into the dedicated `/search` screen (M2, autocomplete + real
          results) rather than a second full-width input duplicating it. */}
      <div className="mt-3 flex items-center gap-2 rounded-[var(--radius)] border border-border bg-card px-3 py-2">
        <Link
          href={user ? '/addresses' : '/serviceability'}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <MapPin className="size-4 shrink-0 text-primary" aria-hidden />
          <span className="min-w-0">
            <span className="block text-[11px] leading-tight text-muted-foreground">
              {t('deliverTo')}
            </span>
            <span className="flex items-center gap-1">
              <span className="truncate text-[13px] leading-tight font-bold">{addressLine}</span>
              <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
            </span>
          </span>
        </Link>

        <span className="flex shrink-0 items-center gap-1 rounded-[calc(var(--radius)-6px)] bg-tint-green px-2.5 py-1.5 text-[11px] leading-tight font-bold text-primary-dark">
          <Zap className="size-3.5 shrink-0 fill-primary-dark" aria-hidden />
          {t('deliveryIn', { minutes: 30 })}
        </span>

        <Link
          href="/search"
          aria-label={tSearch('placeholder')}
          className="grid size-8 shrink-0 place-items-center rounded-full border-l border-border pl-2 text-foreground"
        >
          <Search className="size-[18px]" strokeWidth={2.4} aria-hidden />
        </Link>
      </div>
    </header>
  );
}
