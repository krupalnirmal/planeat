'use client';

import { ChevronRight, ShoppingCart, Truck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef } from 'react';
import { Link, usePathname } from '@/i18n/navigation';
import { useCart } from '@/hooks/use-cart';
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
  // The most recently touched line — the one photo worth showing on the
  // bar, matching the same "confirm that tap landed" job the icon used to
  // do (client feedback, session 2026-09-02), now with the actual product
  // instead of a generic cart glyph (session 2026-09-16, client reference).
  const latestImage = cart.lines[cart.lines.length - 1]?.imageUrl ?? null;

  return (
    <div
      ref={barRef}
      // Narrower side inset than the edge-to-edge Blinkit original (session
      // 2026-08-26, client feedback: the full-width bar read as too big) —
      // still one stacked unit with the free-delivery nudge above it, just
      // a compact floating pill instead of a bar spanning the screen.
      className="fixed inset-x-0 z-30 mx-auto max-w-[480px] px-14"
      style={{
        // BottomNav is always visible now (session 2026-09-16), so this
        // always sits above its fixed height — same pattern every other
        // sticky bar in the app already uses.
        bottom: `calc(var(--bottom-nav-height) + env(safe-area-inset-bottom, 0px) + 0.5rem)`,
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

      <Link
        href="/cart"
        className="animate-in slide-in-from-bottom-4 fade-in relative flex min-h-14 items-center gap-3 rounded-full bg-primary py-2 pr-4 pl-16 text-primary-foreground duration-300"
      >
        {/* Pops half out of the pill's top-left corner, a white ring
            separating it from the green — the reference's "product peeking
            out of the bag" treatment. `key` remounts it on every count
            change to replay the pop-in, same trigger the old icon used. */}
        <span
          key={cart.itemCount}
          className="absolute -top-2.5 left-1.5 grid size-14 shrink-0 animate-in zoom-in-75 place-items-center overflow-hidden rounded-full border-[3px] border-background bg-card duration-200"
        >
          {latestImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={latestImage} alt="" className="size-full object-cover" />
          ) : (
            <ShoppingCart className="size-5 text-primary" aria-hidden />
          )}
        </span>

        <span className="min-w-0 flex-1">
          <span className="block text-[15px] leading-tight font-bold">{t('viewCart')}</span>
          <span className="block text-[11px] leading-tight text-primary-foreground/80">
            {t('itemCount', { count: cart.itemCount })}
          </span>
        </span>

        <ChevronRight className="size-5 shrink-0" aria-hidden />
      </Link>
    </div>
  );
}
