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

  const selected = variants.find((v) => v.id === selectedId) ?? null;
  const cart = useCart();
  const quantity = selected ? cart.quantityOf(selected.id) : 0;

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
    cart.add({ productId, variantId: selected.id });
  }

  return (
    <>
      <div className="mt-3 flex items-baseline gap-2">
        <span className="text-2xl font-bold">{formatPaise(price)}</span>
        {mrp > price && (
          <>
            <span className="text-sm text-muted-foreground line-through">
              {formatPaise(mrp, { hidePaise: true })}
            </span>
            <span className="rounded bg-accent px-1.5 py-0.5 text-[11px] font-bold text-accent-foreground">
              {Math.round((1 - Number(price) / Number(mrp)) * 100)}%
            </span>
          </>
        )}
      </div>

      {variants.length > 1 && (
        <fieldset className="mt-5">
          <legend className="text-sm font-semibold">{t('selectVariant')}</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {variants.map((variant) => (
              <button
                key={variant.id}
                type="button"
                onClick={() => setSelectedId(variant.id)}
                aria-pressed={variant.id === selectedId}
                disabled={variant.stockQty === 0}
                className={cn(
                  'min-h-11 rounded-[var(--radius)] border px-4 text-sm transition-colors disabled:opacity-40',
                  variant.id === selectedId
                    ? 'border-primary bg-primary/5 font-semibold text-primary'
                    : 'border-border bg-card text-muted-foreground',
                )}
              >
                <span className="block">
                  {formatQuantity(variant.quantity, variant.unit as QuantityUnit)}
                </span>
                <span className="block text-[11px]">
                  {formatPaise(paise(variant.pricePaise), { hidePaise: true })}
                </span>
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

      {/* Sticky above the bottom nav, so ADD stays reachable however long the
          page gets. */}
      <div
        className="fixed inset-x-0 z-30 mx-auto max-w-[480px] border-t border-border bg-card px-4 py-3"
        style={{ bottom: 'calc(var(--bottom-nav-height) + env(safe-area-inset-bottom, 0px))' }}
      >
        {!inStock ? (
          <button
            type="button"
            disabled
            className="h-12 w-full rounded-[var(--radius)] border border-border text-sm font-semibold text-muted-foreground"
          >
            {t('outOfStock')}
          </button>
        ) : quantity === 0 ? (
          <button
            type="button"
            onClick={handleAdd}
            className="h-12 w-full rounded-[var(--radius)] bg-primary text-sm font-bold text-primary-foreground"
          >
            {isLoggedIn ? t('add') : ta('loginRequiredCart')}
          </button>
        ) : (
          <QtyStepper
            quantity={quantity}
            onIncrement={() => cart.increment(selected.id)}
            onDecrement={() => cart.decrement(selected.id)}
            disabled={cart.isMutating}
            max={selected.stockQty}
            label={productName}
            className="h-12"
          />
        )}
      </div>

      {/* Reserves room so the sticky bar never covers the last section. */}
      <div aria-hidden className="h-16" />
    </>
  );
}
