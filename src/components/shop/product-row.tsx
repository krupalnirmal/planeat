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
 * product comes in as its own priced chip in a horizontally-scrollable
 * strip below (250 g through 2 kg comfortably reachable by a swipe, rather
 * than wrapping into a cramped second row).
 *
 * Picking a weight is a single choice per product here, not an independent
 * add per variant: choosing 500 g after already having 250 g in the cart
 * swaps the line rather than leaving both — a customer scanning this list
 * reads "how much carrot am I getting", and two simultaneous weights read
 * as a mistake, not a deliberate double purchase. (The product detail
 * page's own variant picker is a separate, unchanged flow.)
 */
export function ProductRow({
  product,
}: {
  product: ProductCardData & { variants?: ProductRowVariant[] };
}) {
  const t = useTranslations('product');
  const router = useRouter();
  const { isLoggedIn } = useSession();
  const cart = useCart();

  // Falls back to the single `variant` for any caller that hasn't been
  // updated to pass the full list yet, so this stays a safe drop-in.
  const variants = product.variants ?? (product.variant ? [product.variant] : []);
  const activeVariantId = variants.find((v) => cart.quantityOf(v.id) > 0)?.id ?? null;

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
        <div className="mt-2.5 -mx-4 flex gap-3 overflow-x-auto px-4 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {variants.map((variant) => (
            <VariantChip
              key={variant.id}
              productId={product.id}
              productName={product.name}
              variant={variant}
              isLoggedIn={isLoggedIn}
              onNeedsLogin={goToLogin}
              otherActiveVariantId={activeVariantId !== variant.id ? activeVariantId : null}
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
  otherActiveVariantId,
}: {
  productId: string;
  productName: string;
  variant: ProductRowVariant;
  isLoggedIn: boolean;
  onNeedsLogin: () => void;
  /** A sibling variant of the same product that already has a cart line —
      picking this one swaps it out rather than adding alongside it. */
  otherActiveVariantId: string | null;
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
    if (otherActiveVariantId) cart.remove(otherActiveVariantId);
    cart.add({ productId, variantId: variant.id });
  }

  return (
    <div className="flex w-16 shrink-0 flex-col items-center gap-1 text-center">
      <span className="text-xs font-medium text-muted-foreground">
        {formatQuantity(variant.quantity, variant.unit as QuantityUnit)}
      </span>
      <span className="flex flex-col items-center leading-tight">
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
            className="h-11 w-16"
          />
        )}
      </div>
    </div>
  );
}
