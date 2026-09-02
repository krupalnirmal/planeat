'use client';

import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowRight,
  ChevronLeft,
  ImageIcon,
  Leaf,
  ShoppingCart,
  Trash2,
} from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { BillSummary, type BillView } from '@/components/shop/bill-summary';
import { CenteredState, PageHeader } from '@/components/shop/page-header';
import { QtyStepper } from '@/components/shop/qty-stepper';
import { useCart } from '@/hooks/use-cart';
import { useSession } from '@/hooks/use-session';
import { api, qs } from '@/lib/api/client';
import { formatPaise, paise } from '@/lib/money';
import { formatQuantity, type QuantityUnit } from '@/lib/quantity';
import { cn } from '@/lib/utils';

/**
 * The cart screen (M3).
 *
 * The bill comes from `/api/checkout/quote` rather than being added up here.
 * B10's fee rules live in one place on the server; a second copy in the browser
 * is a second place for them to be wrong.
 *
 * Redesigned (session 2026-09-02) to the client's own mockup: a warm cream
 * page, a custom header with a decorative leaf illustration and a badged
 * cart icon, heavily rounded white item cards, a light-green "handpicked"
 * banner, and a dashed-border dark-green total bar with a bag illustration.
 * Only the happy-path (cart has items) state gets this treatment — the
 * loading/empty/logged-out states below keep the plain shared PageHeader,
 * since the reference itself only ever shows a cart with items in it.
 */

interface QuoteResponse {
  bill: BillView;
  canPlaceOrder: boolean;
  unavailableLines: Array<{ id: string; name: string; reason: string; availableQty: number }>;
}

export function CartScreen() {
  const t = useTranslations('cart');
  const tc = useTranslations('common');
  const locale = useLocale();
  const { isLoggedIn, isLoading: sessionLoading, defaultAddress } = useSession();
  const cart = useCart();

  const quote = useQuery({
    queryKey: ['checkout-quote', locale, cart.itemCount, cart.itemTotalPaise],
    queryFn: () => api.post<QuoteResponse>(`/api/checkout/quote${qs({ locale })}`, {}),
    enabled: isLoggedIn && cart.lines.length > 0,
  });

  // MRP minus price, per sellable line. The quote does not carry MRP — only
  // the cart lines do — so this is the one place that can total it up.
  const savedPaise = cart.lines
    .filter((line) => line.isActive)
    .reduce(
      (sum, line) =>
        sum + (paise(line.mrpPaise) - paise(line.unitPricePaise)) * BigInt(line.quantity),
      0n,
    )
    .toString();

  if (sessionLoading || cart.isLoading) {
    return (
      <>
        <PageHeader title={t('title')} backHref="/" backLabel={tc('back')} />
        <main className="pb-2">
          <div className="bg-card px-4 py-8 text-sm text-muted-foreground">{tc('loading')}</div>
        </main>
      </>
    );
  }

  if (cart.lines.length === 0) {
    return (
      <>
        <PageHeader title={t('title')} backHref="/" backLabel={tc('back')} />
        <main className="pb-2">
          <div className="bg-card">
            <CenteredState>
              <ShoppingCart className="size-12 text-muted-foreground/30" aria-hidden />
              <p className="mt-4 text-base font-semibold">{t('empty')}</p>
              <p className="mt-1 text-sm text-muted-foreground">{t('emptyHint')}</p>
              <Link
                href="/"
                className="mt-6 flex h-11 w-full max-w-xs items-center justify-center rounded-[var(--radius)] bg-primary text-sm font-bold text-primary-foreground"
              >
                {t('startShopping')}
              </Link>
            </CenteredState>
          </div>
        </main>
      </>
    );
  }

  // A guest cart holds only quantities — the names and prices live on the
  // server. Rather than fetching the catalogue twice, send them to log in,
  // which is where B17 puts the commitment point anyway.
  if (!isLoggedIn) {
    return (
      <>
        <PageHeader title={t('title')} backHref="/" backLabel={tc('back')} />
        <main className="pb-2">
          <div className="bg-card">
            <CenteredState>
              <ShoppingCart className="size-12 text-muted-foreground/30" aria-hidden />
              <p className="mt-4 text-sm font-medium">{t('itemCount', { count: cart.itemCount })}</p>
              <Link
                href="/login?next=/cart"
                className="mt-6 flex h-11 w-full max-w-xs items-center justify-center rounded-[var(--radius)] bg-primary text-sm font-bold text-primary-foreground"
              >
                {t('proceed')}
              </Link>
            </CenteredState>
          </div>
        </main>
      </>
    );
  }

  const blocked = (quote.data?.unavailableLines.length ?? 0) > 0;

  return (
    <main className="min-h-dvh space-y-4 bg-accent-faint px-4 pt-4 pb-2">
      {/* Header — back arrow, big bold title + leaf-bulleted subtitle, a
          faded decorative leaf behind a white badged cart icon. */}
      <header className="relative flex items-start justify-between gap-3">
        {/* No overflow-hidden here — the image is 106x106 and taller than
            this header's own flex content, so clipping it squashed it into
            a small box instead of letting it spread naturally behind the
            cart icon (client screenshot, session 2026-09-02). z-0 keeps it
            behind the title and icon, which sit at z-10. */}
        {/* eslint-disable-next-line @next/next/no-img-element -- small static decorative asset, not worth next/image's setup */}
        <img
          src="/decor/leaf.png"
          alt=""
          aria-hidden
          className="pointer-events-none absolute top-0 right-8 z-0 size-20 object-contain"
        />
        <div className="relative z-10 flex min-w-0 items-start gap-1">
          <Link
            href="/"
            aria-label={tc('back')}
            className="mt-1 grid size-9 shrink-0 place-items-center rounded-full"
          >
            <ChevronLeft className="size-5" aria-hidden />
          </Link>
          <div className="min-w-0">
            <h1 className="text-2xl font-black">{t('title')}</h1>
            <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
              <Leaf className="size-4 shrink-0 text-primary" aria-hidden />
              <span className="truncate">
                {t('itemCount', { count: cart.itemCount })} · {t('tagline')}
              </span>
            </p>
          </div>
        </div>

        {/* Decorative, not a link — this screen already is the cart, so
            there is nowhere for it to navigate to. */}
        <div aria-hidden className="relative z-10 mt-1 shrink-0">
          <span className="grid size-12 place-items-center rounded-full bg-card shadow-sm">
            <ShoppingCart className="size-5" aria-hidden />
          </span>
          <span className="absolute -top-1 -right-1 grid size-5 place-items-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
            {cart.itemCount}
          </span>
        </div>
      </header>

      {defaultAddress && (
        <div className="card-3d flex items-center gap-3 rounded-[var(--radius-2xl)] bg-card px-4 py-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-tint-green">
            <Leaf className="size-4 text-primary" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted-foreground">{t('deliverTo')}</p>
            <p className="truncate text-sm font-semibold">
              {[defaultAddress.line1, defaultAddress.city].filter(Boolean).join(', ')}
            </p>
          </div>
          <Link href="/addresses" className="shrink-0 text-xs font-bold text-primary">
            {tc('edit')}
          </Link>
        </div>
      )}

      {blocked && (
        <p className="flex items-start gap-2 rounded-[var(--radius-2xl)] bg-[#FDF3E3] px-3.5 py-3 text-xs text-warning">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          {t('unavailableItems')}
        </p>
      )}

      <ul className="space-y-3">
        {cart.lines.map((line) => {
          const unavailable = !line.isActive || !line.inStock;

          return (
            <li
              key={line.id}
              className={cn(
                'card-3d flex gap-3 rounded-[var(--radius-2xl)] bg-card p-3',
                unavailable && 'opacity-70',
              )}
            >
              <div className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-[var(--radius-xl)] bg-secondary">
                {line.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={line.imageUrl} alt="" aria-hidden className="size-full object-cover" />
                ) : (
                  <ImageIcon className="size-6 text-muted-foreground/40" aria-hidden />
                )}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="line-clamp-2 min-w-0 text-sm font-bold">
                    {line.nameEn}
                    {line.localName && (
                      <span className="font-normal text-muted-foreground"> ({line.localName})</span>
                    )}
                  </p>
                  <span className="shrink-0 text-base font-bold">
                    {formatPaise(paise(line.linePaise), { hidePaise: true })}
                  </span>
                </div>
                <p className="mt-0.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <Leaf className="size-3.5 shrink-0 text-primary" aria-hidden />
                  {formatQuantity(line.unitQuantity, line.unit as QuantityUnit)} ·{' '}
                  {formatPaise(paise(line.unitPricePaise), { hidePaise: true })}
                </p>

                {unavailable && (
                  <p className="mt-1 text-[11px] font-medium text-warning">
                    {line.isActive
                      ? t('outOfStockLine', { count: line.availableQty })
                      : t('unavailableItems')}
                  </p>
                )}

                <div className="mt-1.5 flex justify-end">
                  {unavailable ? (
                    <button
                      type="button"
                      onClick={() => cart.remove(line.variantId)}
                      className="flex h-11 items-center gap-1.5 rounded-xl border border-border px-3 text-xs font-medium"
                    >
                      <Trash2 className="size-3.5" aria-hidden />
                      {tc('remove')}
                    </button>
                  ) : (
                    <QtyStepper
                      quantity={line.quantity}
                      onIncrement={() => cart.increment(line.variantId)}
                      onDecrement={() => cart.decrement(line.variantId)}
                      disabled={cart.isMutating}
                      max={line.availableQty}
                      label={line.name}
                      size="sm"
                      tone="tint"
                    />
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      <p className="flex items-center justify-center gap-2 rounded-full bg-tint-green px-4 py-2.5 text-center text-xs font-bold text-primary-dark">
        <Leaf className="size-4 shrink-0" aria-hidden />
        {t('handpickedBanner')}
      </p>

      {quote.data && <BillSummary bill={quote.data.bill} savedPaise={savedPaise} />}

      {/* Sticky above the bottom nav so the total and the next step are always
          on screen, however long the cart gets. Dashed border + bag
          illustration per the client's reference. */}
      <div
        className="fixed inset-x-0 z-30 mx-auto max-w-[480px] px-4"
        style={{ bottom: 'calc(var(--bottom-nav-height) + env(safe-area-inset-bottom, 0px) + 0.75rem)' }}
      >
        <div className="flex items-center gap-3 rounded-[var(--radius-2xl)] border-2 border-dashed border-primary-foreground/30 bg-primary-dark px-4 py-3 shadow-lg">
          {/* eslint-disable-next-line @next/next/no-img-element -- small static decorative asset, not worth next/image's setup */}
          <img src="/decor/cart-bag.png" alt="" aria-hidden className="size-10 shrink-0 object-contain" />
          <div className="min-w-0 flex-1">
            <p className="text-lg leading-tight font-black text-primary-foreground">
              {quote.data ? formatPaise(paise(quote.data.bill.totalPaise)) : '—'}
            </p>
            <p className="text-xs text-primary-foreground/80">{t('totalAmount')}</p>
          </div>
          <span aria-hidden className="h-8 w-px shrink-0 bg-primary-foreground/25" />
          <Link
            href="/checkout"
            aria-disabled={!quote.data?.canPlaceOrder}
            className={cn(
              'flex h-11 shrink-0 items-center gap-1.5 rounded-full bg-card px-5 text-sm font-bold text-primary-dark',
              !quote.data?.canPlaceOrder && 'pointer-events-none opacity-50',
            )}
          >
            {t('proceed')}
            <ArrowRight className="size-4" aria-hidden />
          </Link>
        </div>
      </div>

      <div aria-hidden className="h-24" />
    </main>
  );
}
