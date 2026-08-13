'use client';

import { ImageIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/navigation';
import { useCart } from '@/hooks/use-cart';
import { useSession } from '@/hooks/use-session';
import { formatPaise, paise } from '@/lib/money';
import { formatQuantity, type QuantityUnit } from '@/lib/quantity';
import { cn } from '@/lib/utils';
import { QtyStepper } from './qty-stepper';

/**
 * M2 product card: image, localised name, weight/unit, struck-through MRP,
 * price, ADD → quantity stepper.
 *
 * B17 — a guest may browse but not add. Tapping ADD sends them to login with a
 * `next` parameter, so they land back on the product they were looking at.
 */

export interface ProductCardData {
  id: string;
  name: string;
  imageUrl: string | null;
  unitType: string;
  inStock: boolean;
  variant: {
    id: string;
    label: string;
    quantity: number;
    unit: string;
    /** Serialised as a string across JSON — money is BigInt (R4). */
    pricePaise: string;
    mrpPaise: string;
    stockQty: number;
    lowStockThreshold: number;
  } | null;
}

export function ProductCard({ product }: { product: ProductCardData }) {
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
    // B17 — browsing is open to everyone; login is required at the commitment
    // point. The guest's cart survives the detour via `POST /api/cart/merge`.
    if (!isLoggedIn) {
      router.push(`/login?next=/product/${product.id}`);
      return;
    }
    cart.add({ productId: product.id, variantId: variant.id });
  }

  return (
    <article className="flex h-full flex-col rounded-[var(--radius)] bg-card p-2.5 shadow-sm">
      <Link
        href={`/product/${product.id}`}
        className="group flex flex-1 flex-col"
        aria-label={product.name}
      >
        <div
          className={cn(
            'relative mb-2 grid aspect-square place-items-center overflow-hidden rounded-[calc(var(--radius)-4px)] bg-secondary',
            !product.inStock && 'opacity-45 grayscale',
          )}
        >
          {product.imageUrl ? (
            // Plain <img>: the storage port already returns a correctly sized,
            // format-optimised URL (f_auto,q_auto,w_300), so routing it through
            // next/image would re-optimise an already-optimised asset and add a
            // Vercel-specific dependency (R11).
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={product.imageUrl}
              alt={product.name}
              loading="lazy"
              decoding="async"
              className="size-full object-cover"
            />
          ) : (
            <ImageIcon className="size-8 text-muted-foreground/40" aria-hidden />
          )}

          {hasDiscount && product.inStock && (
            <span className="absolute top-1 left-1 rounded bg-primary px-1.5 py-0.5 text-[10px] font-bold text-primary-foreground">
              {Math.round((1 - Number(price) / Number(mrp)) * 100)}% {t('off')}
            </span>
          )}
        </div>

        <h3 className="line-clamp-2 text-[13px] leading-tight font-medium">{product.name}</h3>

        {variant && (
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {formatQuantity(variant.quantity, variant.unit as QuantityUnit)}
          </p>
        )}

        <div className="mt-1.5 flex items-baseline gap-1.5">
          <span className="text-sm font-bold">{formatPaise(price, { hidePaise: true })}</span>
          {hasDiscount && (
            <span className="text-[11px] text-muted-foreground line-through">
              {formatPaise(mrp, { hidePaise: true })}
            </span>
          )}
        </div>
      </Link>

      <div className="mt-2">
        {!product.inStock || !variant ? (
          <button
            type="button"
            className="h-11 w-full rounded-[var(--radius)] border border-border text-xs font-semibold text-muted-foreground"
            disabled
          >
            {t('outOfStock')}
          </button>
        ) : quantity === 0 ? (
          <button
            type="button"
            onClick={handleAdd}
            className="h-11 w-full rounded-[var(--radius)] bg-primary text-sm font-bold text-primary-foreground shadow-sm"
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
          />
        )}

        {variant && product.inStock && variant.stockQty <= variant.lowStockThreshold && (
          <p className="mt-1 text-center text-[10px] font-medium text-warning">
            {t('lowStock', { count: variant.stockQty })}
          </p>
        )}
      </div>
    </article>
  );
}
