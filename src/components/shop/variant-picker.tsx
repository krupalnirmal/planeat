'use client';

import { Clock, ShoppingCart } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import { useCart } from '@/hooks/use-cart';
import { useSession } from '@/hooks/use-session';
import { formatPaise, paise } from '@/lib/money';
import { formatQuantity, type QuantityUnit } from '@/lib/quantity';
import { cn } from '@/lib/utils';
import { QtyStepper } from './qty-stepper';

/**
 * PDP variant selector (M2: 250 g / 500 g / 1 kg) plus the Add to Cart
 * action.
 *
 * Each variant is its own cart line, because that is what stock is tracked
 * against — 500 g and 1 kg of the same vegetable are separate sellable units.
 *
 * Restyled (session 2026-09-21, client reference): the price row used to
 * only show for single-variant products (a multi-variant product's price
 * only ever appeared inside each variant card); it's now unified into one
 * row that always shows, reflecting whichever variant is selected. The
 * weight cards became plain pills now that they don't need to carry their
 * own price/discount badge. The pre-add "Select Quantity" stepper is gone —
 * the reference just adds 1 and hands off to the same post-add `QtyStepper`
 * every other Add button in this app already uses (`product-card.tsx`'s own
 * ADD button behaves identically) — and the add control is no longer a
 * `fixed`-to-viewport-bottom bar paired with a second price display; it's a
 * plain full-width button in the normal page flow, since the price above
 * already covers what the bar used to show.
 */

export interface VariantOption {
  id: string;
  label: string;
  quantity: number;
  unit: string;
  pricePaise: string;
  mrpPaise: string;
  stockQty: number;
  lowStockThreshold: number;
  isDefault: boolean;
}

export function VariantPicker({
  productId,
  productName,
  variants,
}: {
  productId: string;
  productName: string;
  variants: VariantOption[];
}) {
  const t = useTranslations('product');
  const ta = useTranslations('auth');
  const router = useRouter();
  const { isLoggedIn } = useSession();

  const [selectedId, setSelectedId] = useState(
    variants.find((v) => v.isDefault)?.id ?? variants[0]?.id ?? '',
  );

  const selected = variants.find((v) => v.id === selectedId) ?? null;
  const cart = useCart();
  const quantity = selected ? cart.quantityOf(selected.id) : 0;

  if (!selected) {
    return <p className="mt-4 text-sm text-muted-foreground">{t('outOfStock')}</p>;
  }

  const price = paise(selected.pricePaise);
  const mrp = paise(selected.mrpPaise);
  const inStock = selected.stockQty > 0;
  const hasDiscount = mrp > price;

  function handleAdd() {
    if (!selected || !isLoggedIn) {
      router.push(`/login?next=/product/${productId}`);
      return;
    }
    cart.add({ productId, variantId: selected.id });
  }

  return (
    <>
      {/* Always shown now, reflecting whichever variant is selected — see
          the file's own doc comment above. */}
      <div className="mt-3 flex items-baseline gap-2">
        <span className="text-2xl font-bold">{formatPaise(price)}</span>
        {hasDiscount && (
          <>
            <span className="text-sm text-muted-foreground line-through">
              {formatPaise(mrp, { hidePaise: true })}
            </span>
            <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] font-bold text-primary-foreground">
              {Math.round((1 - Number(price) / Number(mrp)) * 100)}% {t('off')}
            </span>
          </>
        )}
      </div>

      {/* Plain pills, not price-carrying cards, now that the price row
          above already covers that. */}
      {variants.length > 1 && (
        <fieldset className="mt-4">
          <div className="flex items-center justify-between gap-2">
            <legend className="text-sm font-semibold">{t('selectVariant')}</legend>
            <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-primary">
              <Clock className="size-3.5" aria-hidden />
              {t('freshlyPicked')}
            </span>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {variants.map((variant) => (
              <button
                key={variant.id}
                type="button"
                onClick={() => setSelectedId(variant.id)}
                aria-pressed={variant.id === selectedId}
                disabled={variant.stockQty === 0}
                className={cn(
                  'rounded-full border-2 px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-40',
                  variant.id === selectedId
                    ? 'border-primary bg-tint-green text-primary-dark'
                    : 'border-border bg-card text-foreground',
                )}
              >
                {formatQuantity(variant.quantity, variant.unit as QuantityUnit)}
              </button>
            ))}
          </div>
        </fieldset>
      )}

      {inStock && selected.stockQty <= selected.lowStockThreshold && (
        <p className="mt-3 text-xs font-medium text-warning">
          {t('lowStock', { count: selected.stockQty })}
        </p>
      )}

      {/* Plain full-width button in the normal page flow — see the file's
          own doc comment for why the fixed-bottom bar and the pre-add
          stepper are both gone. */}
      <div className="mt-5">
        {!inStock ? (
          <button
            type="button"
            disabled
            className="flex h-12 w-full items-center justify-center gap-2 rounded-[var(--radius)] border border-border text-sm font-semibold text-muted-foreground"
          >
            {t('outOfStock')}
          </button>
        ) : quantity === 0 ? (
          <button
            type="button"
            onClick={handleAdd}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-[var(--radius)] bg-primary text-sm font-bold text-primary-foreground"
          >
            <ShoppingCart className="size-4.5" aria-hidden />
            {isLoggedIn ? t('addToCart') : ta('loginRequiredCart')}
          </button>
        ) : (
          <QtyStepper
            quantity={quantity}
            onIncrement={() => cart.increment(selected.id)}
            onDecrement={() => cart.decrement(selected.id)}
            disabled={cart.isMutating}
            max={selected.stockQty}
            label={productName}
            className="animate-in zoom-in-95 fade-in h-12 w-full duration-200"
          />
        )}
      </div>
    </>
  );
}
