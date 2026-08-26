'use client';

import { Clock, Heart, ImageIcon, Package } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useState, useSyncExternalStore } from 'react';
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
 * M2 product card, redesigned (session 2026-08-26) to match a reference the
 * client supplied: a full-bleed square photo, a heart toggle riding over its
 * top-right corner, and a weight/ADD bar that overlaps the photo's bottom
 * edge before the price, name and delivery line underneath.
 *
 * The reference also shows per-card image carousel dots and an "Imported"
 * badge — both skipped here since neither has data behind it yet (the
 * catalogue stores one photo per product, and no product carries a country
 * of origin). Wiring those up is a data-model change, not a restyle.
 *
 * The heart is a real per-device toggle (localStorage, keyed by product id)
 * rather than a decoration with no effect — but it doesn't sync to an
 * account or a wishlist page, since neither exists yet.
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

// Same shape as `useRecentSearches` (src/hooks/use-recent-searches.ts):
// localStorage read through `useSyncExternalStore`, not an effect + setState
// — that would cascade an extra render on every card's mount and mismatch
// the empty server render against the populated client one.
const wishlistListeners = new Set<() => void>();

function wishlistKey(productId: string) {
  return `getfresh.wishlist.${productId}`;
}

function readWishlisted(productId: string): boolean {
  try {
    return window.localStorage.getItem(wishlistKey(productId)) === '1';
  } catch {
    return false; // Private mode — behave as if nothing is wishlisted.
  }
}

function writeWishlisted(productId: string, value: boolean): void {
  try {
    if (value) window.localStorage.setItem(wishlistKey(productId), '1');
    else window.localStorage.removeItem(wishlistKey(productId));
  } catch {
    // Quota or private mode — the toggle still works for this render.
  }
  for (const listener of wishlistListeners) listener();
}

function subscribeWishlist(onChange: () => void): () => void {
  wishlistListeners.add(onChange);
  return () => wishlistListeners.delete(onChange);
}

function getServerWishlisted(): boolean {
  return false;
}

function useWishlisted(productId: string) {
  const wishlisted = useSyncExternalStore(
    subscribeWishlist,
    () => readWishlisted(productId),
    getServerWishlisted,
  );
  const toggle = useCallback(() => writeWishlisted(productId, !readWishlisted(productId)), [productId]);
  return [wishlisted, toggle] as const;
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
  const [wishlisted, toggleWishlisted] = useWishlisted(product.id);

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
  const isLowStock =
    activeVariant && product.inStock && activeVariant.stockQty <= activeVariant.lowStockThreshold;

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
    <article className="relative flex h-full flex-col overflow-hidden rounded-[var(--radius)] border border-border bg-card">
      <Link href={`/product/${product.id}`} aria-label={product.name} tabIndex={-1}>
        <div
          className={cn(
            'relative grid aspect-square place-items-center bg-white',
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
            <span className="absolute top-1.5 left-1.5 rounded bg-primary px-1.5 py-0.5 text-[10px] font-bold text-primary-foreground">
              {Math.round((1 - Number(price) / Number(mrp)) * 100)}% {t('off')}
            </span>
          )}
        </div>
      </Link>

      {/* Kept outside the link so the card never nests two interactive
          elements — a screen reader would otherwise announce the whole
          image as both "go to product" and "toggle wishlist". */}
      <button
        type="button"
        onClick={toggleWishlisted}
        aria-pressed={wishlisted}
        aria-label={t(wishlisted ? 'wishlistRemove' : 'wishlistAdd', { name: product.name })}
        className="absolute top-1.5 right-1.5 grid size-7 place-items-center rounded-full bg-card/95 shadow-sm"
      >
        <Heart
          className={cn('size-3.5', wishlisted ? 'fill-primary text-primary' : 'text-muted-foreground')}
          aria-hidden
        />
      </button>

      {/* Weight + add control ride up over the photo's bottom edge, as in
          the reference — the card's one deliberately overlapping element. */}
      <div className="relative z-10 mx-1.5 -mt-3 flex items-center justify-between gap-1 rounded-[calc(var(--radius)-4px)] bg-card px-1.5 py-1 shadow-sm">
        <span className="min-w-0 truncate text-[10.5px] font-medium text-muted-foreground">
          {activeVariant ? formatQuantity(activeVariant.quantity, activeVariant.unit as QuantityUnit) : ''}
        </span>

        <div className="flex shrink-0 flex-col items-end">
          {!product.inStock || !activeVariant ? (
            <span className="text-[10px] font-semibold text-muted-foreground">{t('outOfStock')}</span>
          ) : quantity === 0 ? (
            <button
              type="button"
              onClick={handleAdd}
              aria-label={`${t('add')} ${product.name}`}
              // A crisp 6px radius and barely-tinted background, in the
              // spirit of the earlier Blinkit-matched button — narrowed to
              // 58px (session 2026-08-26) so the weight label next to it in
              // this bar has room to read as more than two letters.
              className="flex h-8 w-[58px] shrink-0 flex-col items-center justify-center gap-0 rounded-[6px] border border-primary bg-[#f7fff9] py-0.5 text-[12px] font-semibold text-primary"
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
              {/* Blinkit-matched (session 2026-08-25): the ADD button pops
                  into the stepper rather than swapping instantly — the
                  same brief scale+fade Blinkit plays on its own button. */}
              <QtyStepper
                quantity={quantity}
                onIncrement={() => cart.increment(activeVariant.id)}
                onDecrement={() => cart.decrement(activeVariant.id)}
                disabled={cart.isMutating}
                max={activeVariant.stockQty}
                label={product.name}
                className="animate-in zoom-in-95 fade-in h-8 duration-200"
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

      <Link
        href={`/product/${product.id}`}
        className="flex flex-1 flex-col px-2.5 pt-1.5 pb-2.5"
        aria-label={product.name}
      >
        <div className="flex items-baseline gap-1">
          <span className="text-[13px] font-bold">{formatPaise(price, { hidePaise: true })}</span>
          {hasDiscount && (
            <span className="text-[12px] text-muted-foreground line-through">
              {formatPaise(mrp, { hidePaise: true })}
            </span>
          )}
        </div>

        <h3 className="mt-0.5 line-clamp-2 text-[13px] leading-tight font-semibold">{product.name}</h3>

        {/* Delivery time and (when it's actually low) remaining stock share
            one row, as in the reference — an icon-led pair of small facts
            rather than two separate lines. */}
        {product.inStock && (
          <p className="mt-1 flex items-center gap-2 text-[10px] font-medium text-muted-foreground">
            <span className="flex items-center gap-0.5">
              <Clock className="size-3" aria-hidden />
              {t('etaMinutes', { minutes: etaMinutes })}
            </span>
            {isLowStock && (
              <span className="flex items-center gap-0.5 text-warning">
                <Package className="size-3" aria-hidden />
                {t('lowStock', { count: activeVariant.stockQty })}
              </span>
            )}
          </p>
        )}
      </Link>

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
