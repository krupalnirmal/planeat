'use client';

import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

/**
 * The order status, translated and colour-coded.
 *
 * Colour carries meaning here, so the label is never colour alone — a
 * red-green colour-blind customer must still be able to tell "delivered" from
 * "cancelled", and on a cheap phone in sunlight so must everyone else.
 */

export type OrderStatusValue =
  | 'PLACED'
  | 'CONFIRMED'
  | 'PACKED'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED'
  | 'CANCELLED'
  | 'FAILED_DELIVERY'
  | 'REFUNDED'
  | 'PAYMENT_PENDING';

const TONE: Record<OrderStatusValue, string> = {
  PLACED: 'bg-secondary text-muted-foreground',
  CONFIRMED: 'bg-primary/10 text-primary',
  PACKED: 'bg-primary/10 text-primary',
  OUT_FOR_DELIVERY: 'bg-accent/20 text-[#8A5A2B]',
  DELIVERED: 'bg-primary/10 text-success',
  CANCELLED: 'bg-danger/10 text-danger',
  FAILED_DELIVERY: 'bg-danger/10 text-danger',
  REFUNDED: 'bg-secondary text-muted-foreground',
  PAYMENT_PENDING: 'bg-[#FDF3E3] text-warning',
};

export function OrderStatusBadge({
  status,
  className,
}: {
  status: OrderStatusValue;
  className?: string;
}) {
  const t = useTranslations('orders.status');

  return (
    <span
      className={cn(
        'inline-block rounded-full px-2.5 py-1 text-[11px] font-semibold',
        TONE[status],
        className,
      )}
    >
      {t(status)}
    </span>
  );
}
