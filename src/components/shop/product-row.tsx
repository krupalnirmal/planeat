'use client';

import { ImageIcon, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/navigation';
import { useCart } from '@/hooks/use-cart';
import { useSession } from '@/hooks/use-session';
import { formatPaise, paise } from '@/lib/money';
import { formatQuantity, type QuantityUnit } from '@/lib/quantity';
import type { ProductCardData } from './product-card';
import { QtyStepper } from './qty-stepper';

export interface ProductRowVariant {
  id: string;
  label: string;
  quantity: number;
  unit: string;
  pricePaise: string;
  mrpPaise: string;
  stockQty: number;
  lowStockThreshold: number;
}

/**
 * The category listing row: image + name on top, then every weight the
 * product comes in as its own priced chip below — the client's reference
 * showed all of a product's variants side by side, not just the default
 * one with a single ADD. Each chip carries its own cart state, since a
 * customer can genuinely have both the 500 g and the 1 kg of the same
 * vegetable in their cart as separate lines.
 */
export function ProductRow({
  product,
}: {
  product: ProductCardData & { variants?: ProductRowVariant[] };
}) {
  const t = useTranslations('product');
  const router = useRouter();
  const { isLoggedIn } = useSession();

  // Falls back to the single `variant` for any caller that hasn't been
  // updated to pass the full list yet, so this stays a safe drop-in.
  const variants = product.variants ?? (product.variant ? [product.variant] : []);

  function goToLogin() {
    router.push(`/login?next=/product/${product.id}`);
  }

  return (
    <div className="py-3">
      <div className="flex items-center gap-3">
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
          <p className="text-xs text-muted-foreground">{t('freshQualityTag')}</p>
        </Link>
      </div>

      {variants.length > 0 ? (
        <div className="mt-2.5 flex flex-wrap gap-x-1 gap-y-2">
          {variants.map((variant) => (
            <VariantChip
              key={variant.id}
              productId={product.id}
              productName={product.name}
              variant={variant}
              isLoggedIn={isLoggedIn}
              onNeedsLogin={goToLogin}
            />
          ))}
        </div>
      ) : (
        <p className="mt-2 text-xs font-semibold text-muted-foreground">{t('outOfStock')}</p>
      )}
    </div>
  );
}

function VariantChip({
  productId,
  productName,
  variant,
  isLoggedIn,
  onNeedsLogin,
}: {
  productId: string;
  productName: string;
  variant: ProductRowVariant;
  isLoggedIn: boolean;
  onNeedsLogin: () => void;
}) {
  const t = useTranslations('product');
  const cart = useCart();
  const quantity = cart.quantityOf(variant.id);

  const price = paise(variant.pricePaise);
  const mrp = paise(variant.mrpPaise);
  const hasDiscount = mrp > price;
  const outOfStock = variant.stockQty <= 0;

  function handleAdd() {
    if (!isLoggedIn) {
      onNeedsLogin();
      return;
    }
    cart.add({ productId, variantId: variant.id });
  }

  return (
    <div className="flex min-w-[4.25rem] flex-1 basis-16 flex-col items-center gap-1 text-center">
      <span className="text-xs font-medium text-muted-foreground">
        {formatQuantity(variant.quantity, variant.unit as QuantityUnit)}
      </span>
      <span className="flex items-baseline gap-1">
        <span className="text-sm font-bold">{formatPaise(price, { hidePaise: true })}</span>
        {hasDiscount && (
          <span className="text-[10px] text-muted-foreground line-through">
            {formatPaise(mrp, { hidePaise: true })}
          </span>
        )}
      </span>

      <div className="mt-0.5">
        {outOfStock ? (
          <span className="text-[10px] font-semibold text-muted-foreground">{t('outOfStock')}</span>
        ) : quantity === 0 ? (
          <button
            type="button"
            onClick={handleAdd}
            aria-label={`${t('add')} — ${productName} ${formatQuantity(variant.quantity, variant.unit as QuantityUnit)}`}
            className="grid size-11 place-items-center rounded-full border border-primary text-primary"
          >
            <Plus className="size-4.5" strokeWidth={2.4} aria-hidden />
          </button>
        ) : (
          <QtyStepper
            quantity={quantity}
            onIncrement={() => cart.increment(variant.id)}
            onDecrement={() => cart.decrement(variant.id)}
            disabled={cart.isMutating}
            max={variant.stockQty}
            label={`${productName} ${formatQuantity(variant.quantity, variant.unit as QuantityUnit)}`}
            className="h-11 w-full"
          />
        )}
      </div>
    </div>
  );
}
