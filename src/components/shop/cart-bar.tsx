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
  // Up to 3 of the most recently touched lines, most recent first — a small
  // stacked thumbnail cluster (session 2026-09-28, owner's Blinkit
  // reference), replacing the single photo that used to pop out above the
  // pill's corner (client feedback, session 2026-09-02/2026-09-16). Falls
  // back to a generic cart glyph tile only when a line has no photo at all.
  const recentImages = cart.lines
    .slice(-3)
    .reverse()
    .map((line) => line.imageUrl);

  return (
    <div
      ref={barRef}
      // Side inset went full-width -> px-32 (session 2026-08-26, then
      // 2026-09-17, client feedback each time on how wide/narrow it read)
      // -> px-4 (session 2026-09-28, owner request: wider, but the pill's
      // own height stays whatever `min-h-14` below already sets — only
      // this side inset changed). Still one stacked unit with the
      // free-delivery nudge above it, just a compact floating pill instead
      // of a bar spanning the screen edge-to-edge. `lg:hidden` (session
      // 2026-09-20) — DesktopHeader's cart icon is the desktop equivalent.
      className="fixed inset-x-0 z-30 mx-auto max-w-[480px] px-4 lg:hidden"
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
        <p className="-mb-3 flex items-center gap-1.5 rounded-t-[var(--radius)] bg-tint-green px-3 pt-1.5 pb-3 text-[11.5px] font-medium">
          <Truck className="size-3.5 shrink-0 text-primary" aria-hidden />
          {t('freeDeliveryNudge', {
            amount: formatPaise(forFreeDelivery, { hidePaise: true }),
          })}
        </p>
      )}

      <Link
        href="/cart"
        // Solid `bg-accent` (session 2026-09-20, client request) — both
        // faint attempts before this (`bg-tint-yellow`, then `bg-accent/20`)
        // read as barely-there against the page's own near-white background
        // on a real device, to the point the bar was hard to spot at all.
        // Full-strength, with `--accent-fg` for contrast, same pairing the
        // header's cart badge already uses.
        // `w-full` (session 2026-09-28, owner report — widening the outer
        // wrapper's inset alone did nothing, because this `<a>` was never
        // told to actually fill it, so it kept shrink-wrapping to its own
        // content and forcing "View cart" onto two lines, which is what
        // was inflating the height past `min-h-14` in the first place) —
        // then dialled back to `w-[70%] mx-auto` (same session, immediate
        // follow-up: full-width read as too wide once it actually worked).
        className="animate-in slide-in-from-bottom-4 fade-in relative mx-auto flex min-h-14 w-[70%] items-center gap-3 rounded-full bg-accent py-2 pr-4 pl-3 text-accent-foreground duration-300"
      >
        {/* A small overlapping thumbnail cluster, inline in the pill
            (session 2026-09-28, owner's Blinkit reference) — replaces the
            single photo that used to pop out above the pill's corner.
            `key` remounts the whole cluster on every count change to
            replay the pop-in, same trigger the old single photo used. */}
        <span key={cart.itemCount} className="flex shrink-0 -space-x-3">
          {recentImages.map((imageUrl, index) => (
            <span
              key={index}
              className="animate-in zoom-in-75 grid size-10 shrink-0 place-items-center overflow-hidden rounded-full border-2 border-accent bg-card duration-200"
              style={{ zIndex: recentImages.length - index }}
            >
              {imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={imageUrl} alt="" className="size-full object-cover" />
              ) : (
                <ShoppingCart className="size-4 text-primary" aria-hidden />
              )}
            </span>
          ))}
        </span>

        <span className="min-w-0 flex-1">
          <span className="block truncate text-[16px] leading-tight font-bold">{t('viewCart')}</span>
          <span className="block truncate text-[12px] leading-tight text-accent-foreground/70">
            {t('itemCount', { count: cart.itemCount })}
          </span>
        </span>

        <ChevronRight className="size-5 shrink-0" aria-hidden />
      </Link>
    </div>
  );
}
