'use client';

import { ChevronRight, ShoppingCart, Truck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef } from 'react';
import { Link, usePathname } from '@/i18n/navigation';
import { useCart } from '@/hooks/use-cart';
import { useIsAtTop } from '@/hooks/use-is-at-top';
import { formatPaise, paise } from '@/lib/money';

/**
 * The floating "View cart · N items" bar that rides above the bottom nav on
 * every shop screen once there is something in the cart.
 *
 * This is the single biggest contributor to the quick-commerce feel in the
 * client's reference recording: the cart is never more than one tap away, and
 * the free-delivery gap follows the customer around the catalogue instead of
 * only appearing once they reach the cart screen.
 *
 * The gap comes from the server (`/api/cart`), which owns B10 — recomputing
 * the threshold here would be a second implementation of a business rule
 * that R8 keeps in `app_settings`.
 */

/**
 * Screens where a floating cart bar would be noise or a duplicate — or,
 * on any screen whose own action button sits in normal page flow rather
 * than its own fixed bar (addresses, subscription, the meal-plan wizard,
 * smart-list review), would float on top of that button and block it.
 */
const HIDDEN_ON = [
  '/cart',
  '/checkout',
  '/login',
  '/profile/complete',
  '/addresses',
  '/subscription',
  // The PDP's own sticky ADD/qty-stepper bar sits at this exact same
  // bottom offset (variant-picker.tsx) — CartBar rendering here too was
  // painting directly over it, hiding ADD whenever the cart already had
  // items from elsewhere.
  '/product',
  // The whole meal-plan section (tab, onboarding wizard, plan view, approval)
  // shares the same in-flow bottom button, not a fixed bar of its own.
  '/meal-plan',
  '/smart-list',
];

export function CartBar() {
  const t = useTranslations('cart');
  const pathname = usePathname();
  const cart = useCart();
  const atTop = useIsAtTop();
  const barRef = useRef<HTMLDivElement>(null);

  const visible =
    cart.itemCount > 0 &&
    !HIDDEN_ON.some((path) => pathname === path || pathname.startsWith(`${path}/`));

  // Every scrollable page reserves exactly this much extra bottom padding
  // (`.app-scroll` in globals.css) so the bar — and its free-delivery
  // nudge, when shown — never floats over a product row's own controls.
  // Measured, not guessed: the nudge appearing/disappearing and locale
  // text wrapping both change the bar's real height.
  useEffect(() => {
    const root = document.documentElement;

    if (!visible || !barRef.current) {
      root.style.setProperty('--cart-bar-reserve', '0px');
      return;
    }

    const el = barRef.current;
    const GAP_PX = 8; // The 0.5rem gap between the bar and the bottom nav.

    const observer = new ResizeObserver(() => {
      root.style.setProperty('--cart-bar-reserve', `${el.offsetHeight + GAP_PX}px`);
    });
    observer.observe(el);
    root.style.setProperty('--cart-bar-reserve', `${el.offsetHeight + GAP_PX}px`);

    return () => {
      observer.disconnect();
      root.style.setProperty('--cart-bar-reserve', '0px');
    };
  }, [visible]);

  if (!visible) return null;

  const forFreeDelivery = paise(cart.amountForFreeDeliveryPaise);
  const total = paise(cart.itemTotalPaise);

  return (
    <div
      ref={barRef}
      // Narrower side inset than the edge-to-edge Blinkit original (session
      // 2026-08-26, client feedback: the full-width bar read as too big) —
      // still one stacked unit with the free-delivery nudge above it, just
      // a compact floating pill instead of a bar spanning the screen.
      className="fixed inset-x-0 z-30 mx-auto max-w-[480px] px-14 transition-[bottom] duration-300 ease-out"
      style={{
        // The nav (BottomNav) stays laid out even while scroll-hidden — it
        // only translates off-screen — so reserving its height here
        // unconditionally left this bar floating above a strip of empty
        // page with nothing under it whenever the nav was hidden (session
        // 2026-08-30). Drop to just the safe-area gap in that state.
        bottom: atTop
          ? `calc(var(--bottom-nav-height) + env(safe-area-inset-bottom, 0px) + 0.5rem)`
          : `calc(env(safe-area-inset-bottom, 0px) + 0.5rem)`,
      }}
    >
      {forFreeDelivery > 0n && (
        // Sits directly on top of the bar and tucks behind it, so the two
        // read as one stacked unit rather than two floating cards.
        <p className="-mb-3 flex items-center gap-1.5 rounded-t-[var(--radius)] bg-tint-green px-3 pt-1.5 pb-3 text-[10.5px] font-medium">
          <Truck className="size-3.5 shrink-0 text-primary" aria-hidden />
          {t('freeDeliveryNudge', {
            amount: formatPaise(forFreeDelivery, { hidePaise: true }),
          })}
        </p>
      )}

      {/* Blinkit-matched (session 2026-08-25), sized down further (session
          2026-08-30, client feedback: read as too big) — 44px, the
          accessibility touch-target floor, rather than the earlier 52px. */}
      <Link
        href="/cart"
        className="animate-in slide-in-from-bottom-4 fade-in relative flex h-11 items-center justify-between gap-3 rounded-[12px] bg-primary py-1.5 pr-4 pl-3 text-primary-foreground duration-300"
      >
        <span className="flex items-center gap-2">
          <ShoppingCart className="size-4.5 shrink-0" aria-hidden />
          <span className="text-[11px] font-medium">{t('itemCount', { count: cart.itemCount })}</span>
          {total > 0n && (
            <span className="text-[11px] font-semibold">
              {formatPaise(total, { hidePaise: true })}
            </span>
          )}
        </span>

        <span className="flex items-center gap-1">
          <span className="text-[14px] font-normal">{t('viewCart')}</span>
          <ChevronRight className="size-4 shrink-0" aria-hidden />
        </span>
      </Link>
    </div>
  );
}
