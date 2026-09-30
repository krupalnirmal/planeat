'use client';

import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowRight,
  ImageIcon,
  Leaf,
  ShoppingCart,
  Timer,
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
 * Redesigned again (session 2026-09-28, owner's Blinkit reference screenshot)
 * to that exact layout/colour scheme: a neutral light-grey page (not the
 * earlier warm cream), a "Delivery in N minutes" card standing in for the
 * old decorative header, one white card holding every line item
 * (divide-y rows instead of a stack of separate cards), a solid-green
 * quantity stepper, an icon-led bill-details card with a "Saved ₹X" badge
 * and a light-blue total-savings banner pulled out below it, a new
 * cancellation-policy card, and a single solid-green sticky bar (replacing
 * the earlier dashed-border dark card + separate white pill button).
 * The "Delivery in N minutes" card replaces the reference's own decorative
 * header art, but PageHeader's sticky title bar stays above all of it —
 * dropping it here (as the happy-path state briefly did) left this one
 * screen without the title bar every other screen carries (owner report,
 * session 2026-10-01).
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
      {/* The happy-path state had dropped this during the Blinkit redesign
          (only the loading/empty/logged-out states above kept it) — every
          other screen in the app carries this same sticky title bar, and
          its absence here read as a missing header with the cart floating
          straight into content with no heading above it (owner report,
          session 2026-10-01). Replaces the bare back-chevron this state
          used to render on its own. */}
      <PageHeader title={t('title')} backHref="/" backLabel={tc('back')} />

      {/* `lg:grid` (session 2026-09-20, desktop layout plan Part E): items
          stack in one column below `lg:`, split into a left items column and
          a sticky right bill-summary column above it — the standard cart/
          checkout shape once there's room for it. */}
      <main className="min-h-dvh space-y-3 bg-page-grey px-4 pt-4 pb-2 lg:grid lg:grid-cols-[1fr_380px] lg:items-start lg:gap-8 lg:space-y-0 lg:px-8 lg:py-8">
      <div className="space-y-3">
        {/* "Delivery in N minutes" card — stands in for the earlier
            decorative header (session 2026-09-28, owner's reference). Same
            30-minute promise the rest of the app already makes
            (`home.deliveryIn`, the checkout screen's Express slot) — not
            the reference's own literal "8 minutes", which is Blinkit's own
            claim, not this business's. */}
        <div className="flex items-center gap-3 rounded-[var(--radius-2xl)] bg-card px-4 py-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-full bg-tint-green">
            <Timer className="size-5 text-primary" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-base font-bold">{t('deliveryInMinutes', { minutes: 30 })}</p>
            <p className="text-xs text-muted-foreground">{t('shipmentOf', { count: cart.itemCount })}</p>
          </div>
        </div>

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

        {/* One card holding every line (session 2026-09-28, owner's
            reference) — divide-y rows instead of a stack of separate
            per-item cards. */}
        <ul className="divide-y divide-border rounded-[var(--radius-2xl)] bg-card px-4">
          {cart.lines.map((line) => {
            const unavailable = !line.isActive || !line.inStock;
            const mrp = paise(line.mrpPaise) * BigInt(line.quantity);
            const price = paise(line.linePaise);
            const hasDiscount = mrp > price;

            return (
              <li
                key={line.id}
                className={cn('flex items-center gap-3 py-3', unavailable && 'opacity-70')}
              >
                <div className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-[var(--radius)] bg-secondary">
                  {line.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={line.imageUrl} alt="" aria-hidden className="size-full object-cover" />
                  ) : (
                    <ImageIcon className="size-6 text-muted-foreground/40" aria-hidden />
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-sm font-bold">
                    {line.nameEn}
                    {line.localName && (
                      <span className="font-normal text-muted-foreground"> ({line.localName})</span>
                    )}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {formatQuantity(line.unitQuantity, line.unit as QuantityUnit)}
                  </p>
                  <p className="mt-1 flex items-baseline gap-1.5">
                    <span className="text-sm font-bold">{formatPaise(price, { hidePaise: true })}</span>
                    {hasDiscount && (
                      <span className="text-xs text-muted-foreground line-through">
                        {formatPaise(mrp, { hidePaise: true })}
                      </span>
                    )}
                  </p>

                  {unavailable && (
                    <p className="mt-1 text-[12px] font-medium text-warning">
                      {line.isActive
                        ? t('outOfStockLine', { count: line.availableQty })
                        : t('unavailableItems')}
                    </p>
                  )}
                </div>

                <div className="shrink-0">
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
                      tone="solid"
                    />
                  )}
                </div>
              </li>
            );
          })}
        </ul>

        <p className="flex items-center justify-center gap-2 rounded-full bg-tint-green px-4 py-2.5 text-center text-xs font-bold text-primary-dark">
          <Leaf className="size-4 shrink-0" aria-hidden />
          {t('handpickedBanner')}
        </p>
      </div>

      {/* Right column at `lg:` — `lg:sticky` so the total and next step
          stay on screen while the left column's item list scrolls past,
          the desktop equivalent of the fixed bottom bar below `lg:`. */}
      <div className="lg:sticky lg:top-24 lg:space-y-3">
        {quote.data && <BillSummary bill={quote.data.bill} savedPaise={savedPaise} />}

        {/* New (session 2026-09-28, owner's reference) — the real business
            rule (`isCustomerCancellable`, src/lib/orders/status.ts: "cancel
            allowed until PACKED"), not placeholder copy. */}
        <section className="mt-3 rounded-[var(--radius-2xl)] bg-card p-4 lg:mt-0">
          <h2 className="text-sm font-bold">{t('cancellationPolicyTitle')}</h2>
          <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
            {t('cancellationPolicyBody')}
          </p>
        </section>

        {/* Sticky above the bottom nav so the total and the next step are
            always on screen, however long the cart gets, below `lg:`. One
            solid-green bar (session 2026-09-28, owner's reference) —
            replaces the earlier dashed-border dark card + separate white
            pill button. `lg:static` (Part E, same trick as VariantPicker's
            add bar in Part D): inline at the bottom of the sticky right
            column instead of fixed to the viewport once there's a column
            for it to sit in. */}
        <div
          className="fixed inset-x-0 z-30 mx-auto max-w-[480px] px-4 lg:static lg:mx-0 lg:max-w-none lg:px-0"
          style={{ bottom: 'calc(var(--bottom-nav-height) + env(safe-area-inset-bottom, 0px) + 0.75rem)' }}
        >
          <Link
            href="/checkout"
            aria-disabled={!quote.data?.canPlaceOrder}
            className={cn(
              'flex h-14 items-center justify-between rounded-[var(--radius-2xl)] bg-primary px-4 shadow-lg',
              !quote.data?.canPlaceOrder && 'pointer-events-none opacity-50',
            )}
          >
            <span className="min-w-0">
              <span className="block text-lg leading-tight font-black text-primary-foreground">
                {quote.data ? formatPaise(paise(quote.data.bill.totalPaise)) : '—'}
              </span>
              <span className="block text-[11px] font-semibold tracking-wide text-primary-foreground/80 uppercase">
                {t('totalAmount')}
              </span>
            </span>
            <span className="flex shrink-0 items-center gap-1.5 text-sm font-bold text-primary-foreground">
              {t('proceed')}
              <ArrowRight className="size-4" aria-hidden />
            </span>
          </Link>
        </div>
      </div>

      <div aria-hidden className="h-24 lg:hidden" />
      </main>
    </>
  );
}
