'use client';

import { ImageIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/navigation';
import { useCart } from '@/hooks/use-cart';
import { useSession } from '@/hooks/use-session';
import { formatPaise, paise } from '@/lib/money';
import { formatQuantity, type QuantityUnit } from '@/lib/quantity';
import type { ProductCardData } from './product-card';
import { QtyStepper } from './qty-stepper';

/**
 * The single-column list row the client's reference uses for a category
 * listing — image, name, weight and price on the left, ADD/stepper on the
 * right. `ProductCard` stays as the grid tile used on the home rails; this is
 * the same cart wiring in the reference's row shape rather than a second
 * cart implementation.
 */
export function ProductRow({ product }: { product: ProductCardData }) {
  const t = useTranslations('product');
  const router = useRouter();
  const { isLoggedIn } = useSession();

  const variant = product.variant;
  const cart = useCart();
  const quantity = variant ? cart.quantityOf(variant.id) : 0;

  const price = variant ? paise(variant.pricePaise) : 0n;
  const mrp = variant ? paise(variant.mrpPaise) : 0n;
  const hasDiscount = mrp > price;

  function handleAdd() {
    if (!variant) return;
    if (!isLoggedIn) {
      router.push(`/login?next=/product/${product.id}`);
      return;
    }
    cart.add({ productId: product.id, variantId: variant.id });
  }

  return (
    <div className="flex items-center gap-3 py-3">
      <Link
        href={`/product/${product.id}`}
        className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-[var(--radius)] border border-border bg-white"
      >
        {product.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={product.imageUrl}
            alt=""
            aria-hidden
            loading="lazy"
            className="size-full object-cover"
          />
        ) : (
          <ImageIcon className="size-5 text-muted-foreground/40" aria-hidden />
        )}
      </Link>

      <Link href={`/product/${product.id}`} className="min-w-0 flex-1">
        <p className="line-clamp-1 text-sm font-semibold">{product.name}</p>
        {variant && (
          <p className="mt-0.5 text-xs text-muted-foreground">
            {formatQuantity(variant.quantity, variant.unit as QuantityUnit)}
          </p>
        )}
        <div className="mt-0.5 flex items-baseline gap-1.5">
          <span className="text-sm font-bold">{formatPaise(price, { hidePaise: true })}</span>
          {hasDiscount && (
            <span className="text-xs text-muted-foreground line-through">
              {formatPaise(mrp, { hidePaise: true })}
            </span>
          )}
        </div>
      </Link>

      <div className="shrink-0">
        {!product.inStock || !variant ? (
          <span className="text-[11px] font-semibold text-muted-foreground">
            {t('outOfStock')}
          </span>
        ) : quantity === 0 ? (
          <button
            type="button"
            onClick={handleAdd}
            className="flex h-9 min-w-[4.5rem] items-center justify-center rounded-[var(--radius)] border border-primary px-3 text-sm font-bold text-primary"
          >
            {t('add')}
          </button>
        ) : (
          <QtyStepper
            quantity={quantity}
            onIncrement={() => cart.increment(variant.id)}
            onDecrement={() => cart.decrement(variant.id)}
            disabled={cart.isMutating}
            max={variant.stockQty}
            label={product.name}
            className="w-24"
          />
        )}
      </div>
    </div>
  );
}
