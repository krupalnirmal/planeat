'use client';

import { useQuery } from '@tanstack/react-query';
import { ChevronRight, RotateCcw } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { ProductCard, type ProductCardData } from '@/components/shop/product-card';
import { useSession } from '@/hooks/use-session';
import { api, qs } from '@/lib/api/client';

/**
 * "Order again" — the things this customer bought before, as a horizontal
 * rail near the top of home.
 *
 * A client component on purpose: the home page itself is a cached server
 * render (`revalidate = 60`) shared by every visitor, and this row is
 * per-customer. Fetching it here keeps the cached shell cacheable and simply
 * renders nothing for a guest or a first-time buyer.
 */
export function OrderAgainRow() {
  const t = useTranslations('home');
  const tc = useTranslations('common');
  const locale = useLocale();
  const { isLoggedIn } = useSession();

  const previouslyBought = useQuery({
    queryKey: ['previously-bought', locale],
    queryFn: () =>
      api.get<{ products: ProductCardData[] }>(
        `/api/orders/previously-bought${qs({ locale })}`,
      ),
    enabled: isLoggedIn,
    staleTime: 5 * 60_000,
  });

  const products = previouslyBought.data?.products ?? [];

  // No skeleton: this row is an accelerator, not content the page owes the
  // customer. A first-time buyer should never see a placeholder for a thing
  // that will never appear.
  if (products.length === 0) return null;

  return (
    // No card of its own (session 2026-08-26) — sits directly on the home
    // page's own tint like every other section now, the product cards
    // inside it carrying the white background.
    <section aria-labelledby="order-again-heading" className="px-4 py-4">
      <div className="mb-3 flex items-baseline justify-between">
        <h2
          id="order-again-heading"
          className="flex items-center gap-1.5 text-[17px] font-bold"
        >
          <RotateCcw className="size-4.5 text-primary" aria-hidden />
          {t('orderAgain')}
        </h2>
        <Link href="/orders" className="flex items-center text-xs font-semibold text-primary">
          {tc('seeAll')}
          <ChevronRight className="size-3.5" aria-hidden />
        </Link>
      </div>

      {/* `scroll-px-4`: see the same rail on the home page — scroll-snap
          otherwise scrolls straight past this padding and the first card
          lands flush against the screen edge. */}
      <ul className="-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-2.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {products.map((product) => (
          <li key={product.id} className="w-[42vw] max-w-[168px] shrink-0 snap-start">
            <ProductCard product={product} />
          </li>
        ))}
      </ul>
    </section>
  );
}
