'use client';

import { Package, ShoppingBag, Truck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { formatPaise, paise } from '@/lib/money';

/**
 * M3 bill summary: item total, delivery fee, discount, grand total, plus the
 * B10 "add ₹X more for free delivery" nudge.
 *
 * Every figure comes from the server's quote. Recomputing any of it here would
 * mean two implementations of B10 that can disagree — and the one the customer
 * reads would be the wrong one.
 *
 * Redesigned (session 2026-09-28, owner's Blinkit reference) — icon-led rows,
 * a "Saved ₹X" badge inline with Items total, delivery charge shown
 * strikethrough-to-FREE the same way, and the "you saved" callout pulled out
 * into its own light-blue banner rather than a green pill inside this card.
 */

export interface BillView {
  itemTotalPaise: string;
  deliveryFeePaise: string;
  handlingFeePaise: string;
  discountPaise: string;
  totalPaise: string;
  amountForFreeDeliveryPaise: string;
  minOrderValuePaise: string;
  meetsMinimum: boolean;
}

export function BillSummary({
  bill,
  savedPaise,
}: {
  bill: BillView;
  /** MRP minus what they actually pay, summed over the cart. Optional: the
      cart screen knows each line's MRP, the checkout quote does not. */
  savedPaise?: string;
}) {
  const t = useTranslations('cart');

  const itemTotal = paise(bill.itemTotalPaise);
  const deliveryFee = paise(bill.deliveryFeePaise);
  const handlingFee = paise(bill.handlingFeePaise);
  const discount = paise(bill.discountPaise);
  const total = paise(bill.totalPaise);
  const forFreeDelivery = paise(bill.amountForFreeDeliveryPaise);
  const saved = savedPaise ? paise(savedPaise) : 0n;
  const itemsMrpTotal = itemTotal + saved;

  return (
    <>
      <section className="rounded-[var(--radius-2xl)] bg-card p-4">
        <h2 className="mb-3 text-sm font-bold">{t('billSummary')}</h2>

        <dl className="space-y-2.5 text-sm">
          <div className="flex items-baseline justify-between gap-2">
            <dt className="flex items-center gap-2 text-muted-foreground">
              <ShoppingBag className="size-4 shrink-0" aria-hidden />
              {t('itemTotal')}
              {saved > 0n && (
                <span className="rounded bg-tint-green px-1.5 py-0.5 text-[11px] font-bold text-primary-dark">
                  {t('savedBadge', { amount: formatPaise(saved, { hidePaise: true }) })}
                </span>
              )}
            </dt>
            <dd className="flex items-baseline gap-1.5 font-semibold">
              {saved > 0n && (
                <span className="text-muted-foreground line-through">
                  {formatPaise(itemsMrpTotal, { hidePaise: true })}
                </span>
              )}
              {formatPaise(itemTotal)}
            </dd>
          </div>

          <div className="flex items-baseline justify-between gap-2">
            <dt className="flex items-center gap-2 text-muted-foreground">
              <Truck className="size-4 shrink-0" aria-hidden />
              {t('deliveryFee')}
            </dt>
            <dd className="font-semibold">
              {deliveryFee === 0n ? <span className="text-primary">{t('free')}</span> : formatPaise(deliveryFee)}
            </dd>
          </div>

          {/* B10 says the handling fee is ₹0 and not to add one. It is only
              rendered if somebody sets a non-zero value in admin. */}
          {handlingFee > 0n && (
            <div className="flex items-baseline justify-between gap-2">
              <dt className="flex items-center gap-2 text-muted-foreground">
                <Package className="size-4 shrink-0" aria-hidden />
                {t('handlingFee')}
              </dt>
              <dd className="font-semibold">{formatPaise(handlingFee)}</dd>
            </div>
          )}

          {discount > 0n && (
            <div className="flex items-baseline justify-between gap-2">
              <dt className="text-muted-foreground">{t('discount')}</dt>
              <dd className="font-semibold text-primary">− {formatPaise(discount)}</dd>
            </div>
          )}

          <div className="flex justify-between border-t border-dashed border-border pt-2.5 text-base font-bold">
            <dt>{t('grandTotal')}</dt>
            <dd>{formatPaise(total)}</dd>
          </div>
        </dl>

        {forFreeDelivery > 0n ? (
          <p className="mt-3 flex items-center gap-2 rounded-[var(--radius)] bg-secondary px-3 py-2 text-xs">
            <Truck className="size-4 shrink-0 text-primary" aria-hidden />
            {t('freeDeliveryNudge', { amount: formatPaise(forFreeDelivery, { hidePaise: true }) })}
          </p>
        ) : (
          deliveryFee === 0n && (
            <p className="mt-3 flex items-center gap-2 rounded-[var(--radius)] bg-primary/5 px-3 py-2 text-xs font-medium text-success">
              <Truck className="size-4 shrink-0" aria-hidden />
              {t('freeDeliveryEarned')}
            </p>
          )
        )}

        {!bill.meetsMinimum && (
          <p className="mt-3 rounded-[var(--radius)] bg-[#FDF3E3] px-3 py-2 text-xs font-medium text-warning">
            {t('belowMinimum', {
              amount: formatPaise(paise(bill.minOrderValuePaise), { hidePaise: true }),
            })}
          </p>
        )}
      </section>

      {/* Pulled out of the card above (session 2026-09-28, owner's
          reference) — its own light-blue banner rather than a badge buried
          inside the bill card, since it is the one number a customer
          actually reads twice. */}
      {saved > 0n && (
        <div className="mt-3 flex items-center justify-between rounded-[var(--radius-2xl)] bg-[#E8F1FE] px-4 py-3 text-sm">
          <span className="font-semibold text-[#1e5fae]">{t('totalSavings')}</span>
          <span className="font-bold text-[#1e5fae]">{formatPaise(saved, { hidePaise: true })}</span>
        </div>
      )}
    </>
  );
}
