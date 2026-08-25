'use client';

import { Mic, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useCart } from '@/hooks/use-cart';
import { useSession } from '@/hooks/use-session';
import { useRouter } from '@/i18n/navigation';
import { formatPaise, paise } from '@/lib/money';
import { formatQuantity, type QuantityUnit } from '@/lib/quantity';
import { QtyStepper } from './qty-stepper';
import type { ProductRowVariant } from './product-row';
import { VoiceQuantitySheet } from './voice-quantity-sheet';

/**
 * The size picker Blinkit's grid cards open when a product has more than
 * one weight ("2 options" under ADD) — this app's own equivalent of the
 * horizontal chip strip the category row used before the Blinkit-style
 * grid replaced it. Picking a weight still replaces whatever weight of
 * this product is already in the cart (D-210): one deliberate choice per
 * product, whether reached by tapping a card or by the voice picker this
 * sheet also opens.
 */
export function VariantPickerSheet({
  productId,
  productName,
  productUnitType,
  variants,
  onClose,
}: {
  productId: string;
  productName: string;
  productUnitType: string;
  variants: ProductRowVariant[];
  onClose: () => void;
}) {
  const t = useTranslations('product');
  const tc = useTranslations('common');
  const router = useRouter();
  const { isLoggedIn } = useSession();
  const cart = useCart();
  const [voiceOpen, setVoiceOpen] = useState(false);

  const activeVariantIds = variants.filter((v) => cart.quantityOf(v.id) > 0).map((v) => v.id);

  function goToLogin() {
    router.push(`/login?next=/product/${productId}`);
  }

  function selectVariant(variant: ProductRowVariant) {
    if (!isLoggedIn) {
      goToLogin();
      return;
    }
    for (const id of activeVariantIds) {
      if (id !== variant.id) cart.remove(id);
    }
    cart.add({ productId, variantId: variant.id });
  }

  function openVoice() {
    if (!isLoggedIn) {
      goToLogin();
      return;
    }
    setVoiceOpen(true);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40">
      <div className="w-full max-w-[480px] rounded-t-[calc(var(--radius)*1.6)] bg-background p-5 pb-8">
        <div className="mb-4 flex items-center justify-between gap-2">
          <h2 className="min-w-0 flex-1 truncate text-base font-bold">{productName}</h2>
          <div className="flex shrink-0 items-center">
            <button
              type="button"
              onClick={openVoice}
              aria-label={t('voiceQuantity.micLabel')}
              className="grid size-11 place-items-center rounded-full text-primary"
            >
              <Mic className="size-5" aria-hidden />
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label={tc('close')}
              className="grid size-11 place-items-center rounded-full"
            >
              <X className="size-5" aria-hidden />
            </button>
          </div>
        </div>

        <div className="space-y-2">
          {variants.map((variant) => {
            const quantity = cart.quantityOf(variant.id);
            const price = paise(variant.pricePaise);
            const mrp = paise(variant.mrpPaise);
            const hasDiscount = mrp > price;
            const outOfStock = variant.stockQty <= 0;

            return (
              <div
                key={variant.id}
                className="flex items-center justify-between gap-3 rounded-[var(--radius)] border border-border px-3.5 py-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold">
                    {formatQuantity(variant.quantity, variant.unit as QuantityUnit)}
                  </p>
                  <p className="flex items-baseline gap-1.5">
                    <span className="text-sm font-bold">
                      {formatPaise(price, { hidePaise: true })}
                    </span>
                    {hasDiscount && (
                      <span className="text-xs text-muted-foreground line-through">
                        {formatPaise(mrp, { hidePaise: true })}
                      </span>
                    )}
                  </p>
                </div>

                {outOfStock ? (
                  <span className="shrink-0 text-xs font-semibold text-muted-foreground">
                    {t('outOfStock')}
                  </span>
                ) : quantity === 0 ? (
                  <button
                    type="button"
                    onClick={() => selectVariant(variant)}
                    aria-label={`${t('add')} — ${productName} ${formatQuantity(variant.quantity, variant.unit as QuantityUnit)}`}
                    className="h-11 shrink-0 rounded-[var(--radius)] border border-primary px-5 text-sm font-bold text-primary"
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
                    label={`${productName} ${formatQuantity(variant.quantity, variant.unit as QuantityUnit)}`}
                    className="h-11 w-28 shrink-0"
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {voiceOpen && (
        <VoiceQuantitySheet
          productId={productId}
          productName={productName}
          productUnitType={productUnitType}
          variants={variants}
          activeVariantIds={activeVariantIds}
          onClose={() => setVoiceOpen(false)}
        />
      )}
    </div>
  );
}
