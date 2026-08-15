'use client';

import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ImageIcon, MapPin, ShoppingCart, Trash2 } from 'lucide-react';
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
    <>
      <PageHeader title={t('title')} backHref="/" backLabel={tc('back')} />
      <main className="space-y-2 pb-2">
      {defaultAddress && (
        <div className="flex items-center gap-2.5 bg-card px-4 py-3">
          <MapPin className="size-4 shrink-0 text-primary" aria-hidden />
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
      <div className="bg-card px-4 py-4">
      <p className="mb-4 text-sm text-muted-foreground">
        {t('itemCount', { count: cart.itemCount })}
      </p>

      {blocked && (
        <p className="mb-4 flex items-start gap-2 rounded-[var(--radius)] bg-[#FDF3E3] px-3 py-2.5 text-xs text-warning">
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
                'flex gap-3 rounded-[var(--radius)] border border-border/60 bg-background p-3',
                unavailable && 'opacity-70',
              )}
            >
              <div className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-[calc(var(--radius)-6px)] bg-secondary">
                {line.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={line.imageUrl} alt="" aria-hidden className="size-full object-cover" />
                ) : (
                  <ImageIcon className="size-6 text-muted-foreground/40" aria-hidden />
                )}
              </div>

              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 text-sm font-medium">{line.name}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
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

                <div className="mt-2 flex items-center justify-between gap-3">
                  <span className="text-sm font-bold">
                    {formatPaise(paise(line.linePaise), { hidePaise: true })}
                  </span>

                  {unavailable ? (
                    <button
                      type="button"
                      onClick={() => cart.remove(line.variantId)}
                      className="flex h-11 items-center gap-1.5 rounded-[var(--radius)] border border-border px-3 text-xs font-medium"
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
                      className="w-28"
                    />
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {quote.data && (
        <div className="mt-5">
          <BillSummary bill={quote.data.bill} savedPaise={savedPaise} />
        </div>
      )}
      </div>

      {/* Sticky above the bottom nav so the total and the next step are always
          on screen, however long the cart gets. */}
      <div
        className="fixed inset-x-0 z-30 mx-auto max-w-[480px] border-t border-border bg-card px-4 py-3"
        style={{ bottom: 'calc(var(--bottom-nav-height) + env(safe-area-inset-bottom, 0px))' }}
      >
        <Link
          href="/checkout"
          aria-disabled={!quote.data?.canPlaceOrder}
          className={cn(
            'flex h-11 items-center justify-between rounded-[var(--radius)] bg-primary px-4 text-sm font-bold text-primary-foreground',
            !quote.data?.canPlaceOrder && 'pointer-events-none opacity-50',
          )}
        >
          <span>{quote.data ? formatPaise(paise(quote.data.bill.totalPaise)) : '—'}</span>
          <span>{t('proceed')}</span>
        </Link>
      </div>

      <div aria-hidden className="h-16" />
      </main>
    </>
  );
}
