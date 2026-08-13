'use client';

import { Truck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { formatPaise, paise } from '@/lib/money';

/**
 * M3 bill summary: item total, delivery fee, discount, grand total, plus the
 * B10 "add ₹X more for free delivery" nudge.
 *
 * Every figure comes from the server's quote. Recomputing any of it here would
 * mean two implementations of B10 that can disagree — and the one the customer
 * reads would be the wrong one.
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

export function BillSummary({ bill }: { bill: BillView }) {
  const t = useTranslations('cart');

  const itemTotal = paise(bill.itemTotalPaise);
  const deliveryFee = paise(bill.deliveryFeePaise);
  const handlingFee = paise(bill.handlingFeePaise);
  const discount = paise(bill.discountPaise);
  const total = paise(bill.totalPaise);
  const forFreeDelivery = paise(bill.amountForFreeDeliveryPaise);

  return (
    <section className="rounded-[var(--radius)] bg-card p-4">
      <h2 className="mb-3 text-sm font-semibold">{t('billSummary')}</h2>

      <dl className="space-y-2 text-sm">
        <Row label={t('itemTotal')} value={formatPaise(itemTotal)} />

        <Row
          label={t('deliveryFee')}
          value={deliveryFee === 0n ? t('free') : formatPaise(deliveryFee)}
          highlight={deliveryFee === 0n}
        />

        {/* B10 says the handling fee is ₹0 and not to add one. It is only
            rendered if somebody sets a non-zero value in admin. */}
        {handlingFee > 0n && (
          <Row label={t('handlingFee')} value={formatPaise(handlingFee)} />
        )}

        {discount > 0n && (
          <Row label={t('discount')} value={`− ${formatPaise(discount)}`} highlight />
        )}

        <div className="flex justify-between border-t border-border pt-2.5 text-base font-bold">
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
  );
}

function Row({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="flex justify-between">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={highlight ? 'font-semibold text-success' : 'font-medium'}>{value}</dd>
    </div>
  );
}
