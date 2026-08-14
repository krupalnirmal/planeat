'use client';

import { ShoppingCart, Truck } from 'lucide-react';
import { useTranslations } from 'next-intl';
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
  // The whole meal-plan section (tab, onboarding wizard, plan view, approval)
  // shares the same in-flow bottom button, not a fixed bar of its own.
  '/meal-plan',
  '/smart-list',
];

export function CartBar() {
  const t = useTranslations('cart');
  const pathname = usePathname();
  const cart = useCart();

  if (cart.itemCount === 0) return null;
  if (HIDDEN_ON.some((path) => pathname === path || pathname.startsWith(`${path}/`))) return null;

  const forFreeDelivery = paise(cart.amountForFreeDeliveryPaise);
  const total = paise(cart.itemTotalPaise);

  return (
    <div
      className="fixed inset-x-0 z-30 mx-auto max-w-[480px] px-3"
      style={{
        bottom: `calc(var(--bottom-nav-height) + env(safe-area-inset-bottom, 0px) + 0.5rem)`,
      }}
    >
      {forFreeDelivery > 0n && (
        // Sits directly on top of the bar and tucks behind it, so the two
        // read as one stacked unit rather than two floating cards.
        <p className="-mb-3 flex items-center gap-1.5 rounded-t-[var(--radius)] bg-tint-green px-3 pt-2 pb-4 text-[11px] font-medium">
          <Truck className="size-3.5 shrink-0 text-primary" aria-hidden />
          {t('freeDeliveryNudge', {
            amount: formatPaise(forFreeDelivery, { hidePaise: true }),
          })}
        </p>
      )}

      <Link
        href="/cart"
        className="relative flex min-h-14 items-center justify-between gap-3 rounded-[var(--radius)] bg-primary px-4 text-primary-foreground shadow-lg"
      >
        <span className="flex items-center gap-2">
          <ShoppingCart className="size-5 shrink-0" aria-hidden />
          <span className="text-sm font-bold">{t('itemCount', { count: cart.itemCount })}</span>
        </span>

        <span className="flex items-center gap-2">
          {total > 0n && (
            <span className="text-sm font-bold">{formatPaise(total, { hidePaise: true })}</span>
          )}
          <span className="text-sm font-black">{t('viewCart')}</span>
        </span>
      </Link>
    </div>
  );
}
