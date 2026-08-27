'use client';

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
 * PDP variant selector (M2: 250 g / 500 g / 1 kg) plus the sticky add bar.
 *
 * Each variant is its own cart line, because that is what stock is tracked
 * against — 500 g and 1 kg of the same vegetable are separate sellable units.
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
  // Pre-add quantity, the reference's "Select Quantity" stepper — a single
  // count picked before the first tap of "Add to Cart", not the post-add
  // stepper (which takes over once the line already exists).
  const [selectedQty, setSelectedQty] = useState(1);

  const selected = variants.find((v) => v.id === selectedId) ?? null;
  const cart = useCart();
  const quantity = selected ? cart.quantityOf(selected.id) : 0;

  // Reset the pre-add count when the customer switches weight variants —
  // done during render (React's documented pattern for "adjust state when a
  // prop changes"), not an effect, so there is no extra render in between.
  const [prevSelectedId, setPrevSelectedId] = useState(selectedId);
  if (selectedId !== prevSelectedId) {
    setPrevSelectedId(selectedId);
    setSelectedQty(1);
  }

  if (!selected) {
    return <p className="mt-4 text-sm text-muted-foreground">{t('outOfStock')}</p>;
  }

  const price = paise(selected.pricePaise);
  const mrp = paise(selected.mrpPaise);
  const inStock = selected.stockQty > 0;

  function handleAdd() {
    if (!selected || !isLoggedIn) {
      router.push(`/login?next=/product/${productId}`);
      return;
    }
    cart.add({ productId, variantId: selected.id, quantity: selectedQty });
  }

  return (
    <>
      {variants.length <= 1 && (
        <div className="mt-3 flex items-baseline gap-2">
          <span className="text-2xl font-bold">{formatPaise(price)}</span>
          {mrp > price && (
            <>
              <span className="text-sm text-muted-foreground line-through">
                {formatPaise(mrp, { hidePaise: true })}
              </span>
              <span className="rounded bg-primary px-1.5 py-0.5 text-[11px] font-bold text-primary-foreground">
                {Math.round((1 - Number(price) / Number(mrp)) * 100)}% {t('off')}
              </span>
            </>
          )}
        </div>
      )}

      {/* Blinkit-matched (session 2026-08-25): a 2-column grid of unit
          cards, each carrying its own discount badge and price, rather
          than a row of plain weight pills — the price is what actually
          changes between variants, so it belongs on the card itself. */}
      {variants.length > 1 && (
        <fieldset className="mt-4">
          <legend className="text-sm font-semibold">{t('selectVariant')}</legend>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {variants.map((variant) => {
              const variantPrice = paise(variant.pricePaise);
              const variantMrp = paise(variant.mrpPaise);
              const variantHasDiscount = variantMrp > variantPrice;
              return (
                <button
                  key={variant.id}
                  type="button"
                  onClick={() => setSelectedId(variant.id)}
                  aria-pressed={variant.id === selectedId}
                  disabled={variant.stockQty === 0}
                  className={cn(
                    'relative overflow-hidden rounded-[var(--radius)] border-2 p-2.5 text-left transition-colors disabled:opacity-40',
                    variant.id === selectedId
                      ? 'border-primary bg-tint-green'
                      : 'border-border bg-card',
                  )}
                >
                  {variantHasDiscount && (
                    <span className="absolute top-0 left-0 rounded-br-[var(--radius)] bg-primary px-1.5 py-0.5 text-[10px] font-bold text-primary-foreground">
                      {Math.round((1 - Number(variantPrice) / Number(variantMrp)) * 100)}%{' '}
                      {t('off')}
                    </span>
                  )}
                  <span className="mt-3.5 block text-sm font-semibold">
                    {formatQuantity(variant.quantity, variant.unit as QuantityUnit)}
                  </span>
                  <span className="mt-0.5 flex items-baseline gap-1">
                    <span className="text-sm font-bold">
                      {formatPaise(variantPrice, { hidePaise: true })}
                    </span>
                    {variantHasDiscount && (
                      <span className="text-[11px] text-muted-foreground line-through">
                        {formatPaise(variantMrp, { hidePaise: true })}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </fieldset>
      )}

      {inStock && selected.stockQty <= selected.lowStockThreshold && (
        <p className="mt-3 text-xs font-medium text-warning">
          {t('lowStock', { count: selected.stockQty })}
        </p>
      )}

      {/* Picking how many before the first ADD tap — the reference's
          "Select Quantity" stepper. Once a line exists, the sticky bar below
          switches to the ordinary post-add stepper for further changes. */}
      {inStock && quantity === 0 && isLoggedIn && (
        <div className="mt-5">
          <p className="text-sm font-semibold">{t('selectQuantity')}</p>
          <div className="mt-2 flex h-11 w-fit items-center rounded-[var(--radius)] border border-border">
            <button
              type="button"
              onClick={() => setSelectedQty((q) => Math.max(1, q - 1))}
              disabled={selectedQty <= 1}
              aria-label={`${t('decreaseQuantity')} — ${productName}`}
              className="grid h-11 w-11 shrink-0 place-items-center text-lg font-bold disabled:opacity-40"
            >
              −
            </button>
            <span className="min-w-10 text-center text-sm font-bold tabular-nums">
              {selectedQty}
            </span>
            <button
              type="button"
              onClick={() => setSelectedQty((q) => Math.min(selected.stockQty, q + 1))}
              disabled={selectedQty >= selected.stockQty}
              aria-label={`${t('increaseQuantity')} — ${productName}`}
              className="grid h-11 w-11 shrink-0 place-items-center text-lg font-bold disabled:opacity-40"
            >
              +
            </button>
          </div>
        </div>
      )}

      {/* Sticky above the bottom nav, Blinkit-matched (session 2026-08-25):
          weight + price sit on the left, the add control on the right —
          not a single full-width button — so the price stays visible next
          to whichever action is available. */}
      <div
        className="fixed inset-x-0 z-30 mx-auto flex max-w-[480px] items-center justify-between gap-3 border-t border-border bg-card px-4 py-3"
        style={{ bottom: 'calc(var(--bottom-nav-height) + env(safe-area-inset-bottom, 0px))' }}
      >
        <div className="min-w-0">
          <p className="truncate text-xs text-muted-foreground">
            {formatQuantity(selected.quantity, selected.unit as QuantityUnit)}
          </p>
          <div className="flex items-baseline gap-1.5">
            <span className="text-lg font-bold">{formatPaise(price, { hidePaise: true })}</span>
            {mrp > price && (
              <span className="text-xs text-muted-foreground line-through">
                {formatPaise(mrp, { hidePaise: true })}
              </span>
            )}
          </div>
        </div>

        {!inStock ? (
          <button
            type="button"
            disabled
            className="h-11 shrink-0 rounded-[var(--radius)] border border-border px-6 text-sm font-semibold text-muted-foreground"
          >
            {t('outOfStock')}
          </button>
        ) : quantity === 0 ? (
          <button
            type="button"
            onClick={handleAdd}
            className="h-11 shrink-0 rounded-[var(--radius)] bg-primary px-6 text-sm font-bold text-primary-foreground"
          >
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
            className="animate-in zoom-in-95 fade-in h-11 shrink-0 duration-200"
          />
        )}
      </div>

    </>
  );
}
