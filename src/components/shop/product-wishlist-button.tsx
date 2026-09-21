'use client';

import { Heart } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useWishlisted } from '@/hooks/use-wishlist';
import { cn } from '@/lib/utils';

/**
 * The PDP hero's wishlist heart (session 2026-09-21, client reference) —
 * same real per-device toggle as `ProductCard`'s own heart
 * (`useWishlisted`, `src/hooks/use-wishlist.ts`), just its own small client
 * component so the server-rendered product page can drop it onto the hero
 * photo without turning the whole page client-side.
 */
export function ProductWishlistButton({ productId, productName }: { productId: string; productName: string }) {
  const t = useTranslations('product');
  const [wishlisted, toggle] = useWishlisted(productId);

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={wishlisted}
      aria-label={t(wishlisted ? 'wishlistRemove' : 'wishlistAdd', { name: productName })}
      className="absolute top-3 right-3 grid size-9 place-items-center rounded-full bg-card/95 shadow-sm"
    >
      <Heart
        className={cn('size-4.5', wishlisted ? 'fill-primary text-primary' : 'text-muted-foreground')}
        aria-hidden
      />
    </button>
  );
}
