'use client';

import { ShoppingCart } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { useCart } from '@/hooks/use-cart';

/**
 * The cart icon the reference puts in the header of every browsing screen
 * (categories, category listing, product detail) — a shortcut to the cart
 * that doesn't depend on the floating `CartBar` being visible.
 */
export function HeaderCartLink() {
  const t = useTranslations('cart');
  const cart = useCart();

  return (
    <Link
      href="/cart"
      aria-label={t('title')}
      className="relative grid size-11 shrink-0 place-items-center rounded-full"
    >
      <ShoppingCart className="size-5" aria-hidden />
      {cart.itemCount > 0 && (
        <span className="absolute top-1 right-1 grid size-4 place-items-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground">
          {cart.itemCount > 9 ? '9+' : cart.itemCount}
        </span>
      )}
    </Link>
  );
}
