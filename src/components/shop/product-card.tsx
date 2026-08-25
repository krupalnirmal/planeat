'use client';

import { Clock, ImageIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Link, useRouter } from '@/i18n/navigation';
import { useCart } from '@/hooks/use-cart';
import { useSession } from '@/hooks/use-session';
import { formatPaise, paise } from '@/lib/money';
import { formatQuantity, type QuantityUnit } from '@/lib/quantity';
import { cn } from '@/lib/utils';
import type { ProductRowVariant } from './product-row';
import { QtyStepper } from './qty-stepper';
import { VariantPickerSheet } from './variant-picker-sheet';

/**
 * M2 product card: image, localised name, weight/unit, struck-through MRP,
 * price, ADD → quantity stepper. Blinkit-matched (session 2026-08-25): a
 * white, primary-bordered "ADD" text button rather than a round "+" icon —
 * same structure as the reference, this app's own green rather than
 * Blinkit's blue, since the two are different brands.
 *
 * B17 — a guest may browse but not add. Tapping ADD sends them to login with a
 * `next` parameter, so they land back on the product they were looking at.
 *
 * `variants` is optional and additive: home rails and search only ever pass
 * a single `variant` and behave exactly as before. The category grid passes
 * the full list — with more than one, the card shows "N options" (Blinkit's
 * own wording) instead of an immediate add, and tapping opens
 * `VariantPickerSheet` instead of adding the default weight sight unseen.
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

export function ProductCard({
  product,
  variants,
  etaMinutes = 30,
}: {
  product: ProductCardData;
  /** The full weight lineup — only the category grid passes this. */
  variants?: ProductRowVariant[];
  /** The instant-delivery promise shown on the card. Matches the header's. */
  etaMinutes?: number;
}) {
  const t = useTranslations('product');
  const router = useRouter();
  const { isLoggedIn } = useSession();
  const cart = useCart();
  const [pickerOpen, setPickerOpen] = useState(false);

  const multiVariant = (variants?.length ?? 0) > 1;

  // With multiple weights, the card shows whichever one is already in the
  // cart (if any) — the same "one active weight at a time" rule the old
  // per-row chips used (D-210) — falling back to the default/first weight
  // for display only, before anything has been picked.
  const activeVariant = multiVariant
    ? (variants!.find((v) => cart.quantityOf(v.id) > 0) ?? variants![0])
    : product.variant;

  const quantity = activeVariant ? cart.quantityOf(activeVariant.id) : 0;
  const price = activeVariant ? paise(activeVariant.pricePaise) : 0n;
  const mrp = activeVariant ? paise(activeVariant.mrpPaise) : 0n;
  const hasDiscount = mrp > price;

  function goToLogin() {
    router.push(`/login?next=/product/${product.id}`);
  }

  function handleAdd() {
    if (!isLoggedIn) {
      goToLogin();
      return;
    }
    if (multiVariant) {
      setPickerOpen(true);
      return;
    }
    if (!product.variant) return;
    // B17 — browsing is open to everyone; login is required at the commitment
    // point. The guest's cart survives the detour via `POST /api/cart/merge`.
    cart.add({ productId: product.id, variantId: product.variant.id });
  }

  return (
    // A hairline border, not a shadow: these cards sit on white section
    // panels now, and a white-on-white shadow reads as nothing at all.
    <article className="flex h-full flex-col rounded-[var(--radius)] border border-border bg-card p-2.5">
      <Link
        href={`/product/${product.id}`}
        className="group flex flex-1 flex-col"
        aria-label={product.name}
      >
        <div
          className={cn(
            'relative mb-2 grid aspect-square place-items-center overflow-hidden rounded-[calc(var(--radius)-4px)] bg-white',
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

        {/* Delivery time per product, as in the reference — quick commerce
            sells speed, so it sits above the name rather than being buried
            once at the top of the page. */}
        {product.inStock && (
          <p className="mb-0.5 flex items-center gap-0.5 text-[9px] font-bold text-muted-foreground">
            <Clock className="size-3" aria-hidden />
            {t('etaMinutes', { minutes: etaMinutes })}
          </p>
        )}

        <h3 className="line-clamp-2 text-[13px] leading-tight font-semibold">{product.name}</h3>

        {activeVariant && (
          <p className="mt-0.5 text-[12px] font-medium text-muted-foreground">
            {formatQuantity(activeVariant.quantity, activeVariant.unit as QuantityUnit)}
          </p>
        )}
      </Link>

      {/* Price and the add control share one row, as in the reference — the
          price sits bottom-left and the add control bottom-right, rather
          than a full-width ADD bar under the card. */}
      <div className="mt-1.5 flex items-end justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-baseline gap-1">
            <span className="text-[12px] font-semibold">
              {formatPaise(price, { hidePaise: true })}
            </span>
            {hasDiscount && (
              <span className="text-[12px] text-muted-foreground line-through">
                {formatPaise(mrp, { hidePaise: true })}
              </span>
            )}
          </div>
          {activeVariant &&
            product.inStock &&
            activeVariant.stockQty <= activeVariant.lowStockThreshold && (
              <p className="mt-0.5 text-[10px] font-medium text-warning">
                {t('lowStock', { count: activeVariant.stockQty })}
              </p>
            )}
        </div>

        <div className="flex shrink-0 flex-col items-end">
          {!product.inStock || !activeVariant ? (
            <span className="text-[10px] font-semibold text-muted-foreground">
              {t('outOfStock')}
            </span>
          ) : quantity === 0 ? (
            <button
              type="button"
              onClick={handleAdd}
              aria-label={`${t('add')} ${product.name}`}
              // Blinkit-matched (session 2026-08-25): 66x32px, a crisp 6px
              // radius (not this app's usual pill-ish 12px) and a barely-
              // tinted background — exact values read off Blinkit's own
              // live button, not eyeballed, since the rounder/whiter
              // version read as noticeably bigger even at the same font size.
              className="flex h-8 w-[66px] flex-col items-center justify-center gap-0 rounded-[6px] border border-primary bg-[#f7fff9] py-0.5 text-[13px] font-semibold text-primary"
            >
              {t('add')}
              {/* "N options" sits inside the same bordered button as a
                  second line, not as a separate underlined link below it. */}
              {multiVariant && (
                <span className="text-[9px] leading-none font-semibold text-muted-foreground">
                  {t('nOptions', { count: variants!.length })}
                </span>
              )}
            </button>
          ) : (
            <>
              <QtyStepper
                quantity={quantity}
                onIncrement={() => cart.increment(activeVariant.id)}
                onDecrement={() => cart.decrement(activeVariant.id)}
                disabled={cart.isMutating}
                max={activeVariant.stockQty}
                label={product.name}
                className="h-9"
              />
              {multiVariant && (
                <button
                  type="button"
                  onClick={() => setPickerOpen(true)}
                  className="mt-0.5 text-[9px] font-semibold text-muted-foreground underline underline-offset-2"
                >
                  {t('nOptions', { count: variants!.length })}
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {pickerOpen && multiVariant && (
        <VariantPickerSheet
          productId={product.id}
          productName={product.name}
          productUnitType={product.unitType}
          variants={variants!}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </article>
  );
}
