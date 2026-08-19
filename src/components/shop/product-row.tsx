'use client';

import { ImageIcon, Mic, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Link, useRouter } from '@/i18n/navigation';
import { useCart } from '@/hooks/use-cart';
import { useSession } from '@/hooks/use-session';
import { formatPaise, paise } from '@/lib/money';
import { formatQuantity, type QuantityUnit } from '@/lib/quantity';
import type { ProductCardData } from './product-card';
import { QtyStepper } from './qty-stepper';
import { VoiceQuantitySheet } from './voice-quantity-sheet';

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
  const [voiceSheetOpen, setVoiceSheetOpen] = useState(false);

  // Falls back to the single `variant` for any caller that hasn't been
  // updated to pass the full list yet, so this stays a safe drop-in.
  const variants = product.variants ?? (product.variant ? [product.variant] : []);
  // Every sibling that currently has a cart line — normally at most one
  // (D-210), but a voice-built combo can legitimately leave several active
  // at once, so tapping a chip or re-opening voice-add has to clear all of
  // them, not just the first.
  const activeVariantIds = variants.filter((v) => cart.quantityOf(v.id) > 0).map((v) => v.id);

  function goToLogin() {
    router.push(`/login?next=/product/${product.id}`);
  }

  function openVoiceSheet() {
    if (!isLoggedIn) {
      goToLogin();
      return;
    }
    setVoiceSheetOpen(true);
  }

  const image = (
    <Link
      href={`/product/${product.id}`}
      className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-[var(--radius)] border border-border bg-white"
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
  );

  // A product that only comes one way (a bunch of coriander, a dozen eggs)
  // doesn't need the name-on-top / chip-strip-below split that multi-weight
  // products use — that layout leaves a single lonely chip under the name.
  // One inline row (image, name, price, add) reads as one complete item.
  if (variants.length <= 1) {
    const variant = variants[0] ?? null;
    return (
      <div className="flex items-center gap-3 py-3">
        {image}
        <Link href={`/product/${product.id}`} className="min-w-0 flex-1">
          <p className="line-clamp-1 text-sm font-semibold">{product.name}</p>
          <p className="text-xs text-muted-foreground">
            {t('freshQualityTag')}
            {variant && ` · ${formatQuantity(variant.quantity, variant.unit as QuantityUnit)}`}
          </p>
        </Link>
        {variant ? (
          <SingleVariantControl
            productId={product.id}
            productName={product.name}
            variant={variant}
            isLoggedIn={isLoggedIn}
            onNeedsLogin={goToLogin}
          />
        ) : (
          <span className="shrink-0 text-xs font-semibold text-muted-foreground">
            {t('outOfStock')}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="py-3">
      <div className="flex items-center gap-3">
        {image}
        <Link href={`/product/${product.id}`} className="min-w-0 flex-1">
          <p className="line-clamp-1 text-sm font-semibold">{product.name}</p>
          <p className="text-xs text-muted-foreground">{t('freshQualityTag')}</p>
        </Link>
        <button
          type="button"
          onClick={openVoiceSheet}
          aria-label={t('voiceQuantity.micLabel')}
          className="grid size-11 shrink-0 place-items-center rounded-full text-primary"
        >
          <Mic className="size-5" aria-hidden />
        </button>
      </div>

      <div className="mt-2.5 -mx-4 flex gap-3 overflow-x-auto px-4 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {variants.map((variant) => (
          <VariantChip
            key={variant.id}
            productId={product.id}
            productName={product.name}
            variant={variant}
            isLoggedIn={isLoggedIn}
            onNeedsLogin={goToLogin}
            otherActiveVariantIds={activeVariantIds.filter((id) => id !== variant.id)}
          />
        ))}
      </div>

      {voiceSheetOpen && (
        <VoiceQuantitySheet
          productId={product.id}
          productName={product.name}
          productUnitType={product.unitType}
          variants={variants}
          activeVariantIds={activeVariantIds}
          onClose={() => setVoiceSheetOpen(false)}
        />
      )}
    </div>
  );
}

function SingleVariantControl({
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
    <div className="flex shrink-0 flex-col items-end gap-1">
      <span className="flex items-baseline gap-1">
        <span className="text-sm font-bold">{formatPaise(price, { hidePaise: true })}</span>
        {hasDiscount && (
          <span className="text-[10px] text-muted-foreground line-through">
            {formatPaise(mrp, { hidePaise: true })}
          </span>
        )}
      </span>

      {outOfStock ? (
        <span className="text-[10px] font-semibold text-muted-foreground">{t('outOfStock')}</span>
      ) : quantity === 0 ? (
        <button
          type="button"
          onClick={handleAdd}
          aria-label={`${t('add')} — ${productName}`}
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
          label={productName}
          className="h-11"
        />
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
  otherActiveVariantIds,
}: {
  productId: string;
  productName: string;
  variant: ProductRowVariant;
  isLoggedIn: boolean;
  onNeedsLogin: () => void;
  /** Sibling variants of the same product that already have a cart line —
      picking this one swaps them out rather than adding alongside them. */
  otherActiveVariantIds: string[];
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
    for (const id of otherActiveVariantIds) cart.remove(id);
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
