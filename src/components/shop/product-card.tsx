'use client';

import { Heart, ImageIcon } from 'lucide-react';
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
 * M2 product card, redesigned (session 2026-08-27) to match the client's
 * full home-page mock exactly: a full-bleed square photo (discount badge
 * top-left, wishlist heart top-right), then name, then weight, then a
 * bottom row with price on the left and ADD on the right — no bar
 * overlapping the photo's bottom edge, no eta-minutes/low-stock line, both
 * of which the mock doesn't show.
 *
 * The mock also shows per-card image carousel dots and an "Imported"
 * badge — both skipped here since neither has data behind it (the
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
  /** English name — shown together with `localName` as "English (local)"
      (session 2026-09-01). Optional so any caller that hasn't been updated
      to pass it still falls back to `name` instead of rendering blank. */
  nameEn?: string;
  /** Always the Marathi name, regardless of the UI's own current locale. */
  localName?: string | null;
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
}: {
  product: ProductCardData;
  /** The full weight lineup — only the category grid passes this. */
  variants?: ProductRowVariant[];
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
    // Raised, not flat: `.card-3d` (session 2026-08-29) gives the card a
    // soft lift off the page instead of relying on a hairline border alone
    // — the border stays too, just faint, since the shadow alone reads as
    // nothing on the lightest backgrounds.
    //
    // `self-start`, not `h-full` (session 2026-09-01): every grid/flex row
    // this card sits in defaults to stretching every item to the row's
    // tallest sibling, and `h-full` + `mt-auto` on the price row below used
    // to absorb that slack by pushing the price down — which reads fine
    // when the gap is small, but became a large, repeatedly-flagged dead
    // zone once bilingual names (session 2026-09-01, "English (local)")
    // widened how much a 1-line vs. 2-line name could differ between
    // siblings. `self-start` opts this card out of the stretch entirely, so
    // it is exactly as tall as its own content — a row's cards can now sit
    // at very slightly different heights, which is far less noticeable
    // than a chunk of empty space inside one of them.
    <article className="card-3d relative flex h-fit w-full flex-col self-start overflow-hidden rounded-[var(--radius)] border border-border/50 bg-card">
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

      <Link
        href={`/product/${product.id}`}
        // `min-h` on the wrapper, not the heading (session 2026-09-01) —
        // reserving 2 lines' worth of space on the `<h3>` itself (session
        // 2026-08-29, to keep a short one-line name from leaving this
        // card's own content shorter than a two-line sibling in the same
        // grid row) pushed the quantity line down to sit under the
        // RESERVED box instead of right under the actual text, opening a
        // visible gap between name and quantity whenever the name was
        // short. Reserving the space here instead still absorbs that same
        // row-height slack, but as space below the quantity line — where
        // `mt-auto` on the price row already expects to find it — rather
        // than wedged between two lines that belong together.
        className="flex min-h-[3.4em] flex-col px-2.5 pt-2"
        aria-label={product.name}
      >
        {/* "English (local)" — client's reference (session 2026-09-01):
            the English name first, the locale's own name alongside it in
            brackets, "Asian-format". `nameEn`/`localName` are optional on
            `ProductCardData` — a caller that hasn't been updated yet still
            gets the single already-localised `name` it always had. */}
        <h3 className="line-clamp-2 text-[13px] leading-tight font-semibold">
          {product.nameEn ?? product.name}
          {product.localName && (
            <span className="font-normal text-muted-foreground"> ({product.localName})</span>
          )}
        </h3>
        {activeVariant && (
          <p className="truncate text-[12px] text-muted-foreground">
            {formatQuantity(activeVariant.quantity, activeVariant.unit as QuantityUnit)}
          </p>
        )}
      </Link>

      {/* Price (left) and the add control (right) share one row at the
          card's bottom edge, exactly as the reference has it — not a bar
          overlapping the photo, and no eta/stock line the reference
          doesn't show either. `mt-auto` pins this row to the bottom even
          when the name above it is a single short line. */}
      <div className="mt-auto flex items-end justify-between gap-1.5 px-2.5 pt-1.5 pb-2">
        <div className="min-w-0">
          <div className="flex items-baseline gap-1">
            <span className="text-[14px] font-bold">{formatPaise(price, { hidePaise: true })}</span>
            {hasDiscount && (
              <span className="text-[12px] text-muted-foreground line-through">
                {formatPaise(mrp, { hidePaise: true })}
              </span>
            )}
          </div>
          {isLowStock && (
            <p className="mt-0.5 text-[10px] font-medium text-warning">
              {t('lowStock', { count: activeVariant.stockQty })}
            </p>
          )}
        </div>

        <div className="flex shrink-0 flex-col items-end">
          {!product.inStock || !activeVariant ? (
            <span className="text-[10px] font-semibold text-muted-foreground">{t('outOfStock')}</span>
          ) : quantity === 0 ? (
            <button
              type="button"
              onClick={handleAdd}
              aria-label={`${t('add')} ${product.name}`}
              // Matches the client's mock: white, a crisp green border (not
              // the earlier tinted fill). Sized down (session 2026-08-28,
              // trimmed further 2026-08-29) from a fixed 64px min-width —
              // that crowded into the price on the narrower Top Picks card
              // and any 3-digit price wrapped right up against it.
              className="flex min-w-[44px] flex-col items-center justify-center gap-0 rounded-lg border-[1.5px] border-primary bg-card px-1.5 py-1 text-[12px] font-bold text-primary"
            >
              {t('add')}
              {/* "N options" sits inside the same bordered button as a
                  second line, not as a separate underlined link below it. */}
              {multiVariant && (
                <span className="text-[8px] leading-none font-semibold text-muted-foreground">
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
                size="sm"
                className="animate-in zoom-in-95 fade-in duration-200"
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
