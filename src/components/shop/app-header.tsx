'use client';

import { useQuery } from '@tanstack/react-query';
import { ChevronDown, Leaf, MapPin, ShoppingCart, UserRound, Wallet, Zap } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { SearchBar } from '@/components/shop/search-bar';
import { useCart } from '@/hooks/use-cart';
import { useSession } from '@/hooks/use-session';
import { api } from '@/lib/api/client';
import { formatPaise, paise } from '@/lib/money';
import { useDeliveryArea } from '@/stores/delivery-area';

/**
 * PART 5 — the sticky home header: wordmark + tagline, three labelled icon
 * buttons (wallet, cart, profile), a combined address/delivery-time row and
 * the search bar.
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
    <header className="sticky top-0 z-30 bg-card px-4 pt-3 pb-3 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        {/* The wordmark itself carries the brand colour — a leaf mark and a
            two-tone "Get" / "Fresh", exactly as the client's logo sheet
            does. "Get" and "Fresh" are brand-name fragments, not content
            (R7 governs translatable text, not a wordmark that is identical
            in mr/hi/en — see D-196/`app.name`'s SHARED_LATIN_KEYS
            exemption). */}
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-1">
            <Leaf className="size-6 shrink-0 -rotate-12 text-primary" aria-hidden />
            <p className="truncate text-2xl font-black tracking-tight">
              <span className="text-primary-dark">Get</span>{' '}
              <span className="text-primary">Fresh</span>
            </p>
          </div>
          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{t('tagline')}</p>
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

      {/* The address and the delivery promise share one bordered card, as
          in the client's reference — the address stacked as a quiet label
          over a bold value, the promise as a tinted pill on the right. */}
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
      </div>

      <SearchBar showMic className="mt-3" />
    </header>
  );
}
