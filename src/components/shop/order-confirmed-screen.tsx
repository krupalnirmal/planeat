'use client';

import { useQuery } from '@tanstack/react-query';
import { Check } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { api } from '@/lib/api/client';

/**
 * The reference's screen 12 — a brief, dedicated "thank you" moment between
 * placing an order and landing on its (much busier) tracking page. Shares
 * the order-detail query cache (`['order', orderId]`), so tapping "Track
 * Order" opens instantly instead of re-fetching what this screen just
 * showed.
 */

type SlotValue = 'EXPRESS' | 'MORNING_7_9' | 'EVENING_5_7' | null;

interface OrderConfirmedResponse {
  order: {
    orderNumber: string;
    placedAt: string;
    deliverySlot: SlotValue;
  };
}

const SLOT_LABEL_KEYS: Record<
  Exclude<SlotValue, null>,
  'slotExpress' | 'slotMorning' | 'slotEvening'
> = {
  EXPRESS: 'slotExpress',
  MORNING_7_9: 'slotMorning',
  EVENING_5_7: 'slotEvening',
};

export function OrderConfirmedScreen({ orderId }: { orderId: string }) {
  const t = useTranslations('orders');
  const tCheckout = useTranslations('checkout');
  const format = useFormatter();

  const detail = useQuery({
    queryKey: ['order', orderId],
    queryFn: () => api.get<OrderConfirmedResponse>(`/api/orders/${orderId}`),
  });

  const order = detail.data?.order;

  return (
    <main className="flex min-h-dvh flex-col bg-tint-green px-6 pt-16 pb-8 text-center">
      <div className="flex flex-1 flex-col items-center">
        <span className="grid size-20 place-items-center rounded-full bg-primary shadow-lg">
          <Check className="size-10 text-primary-foreground" strokeWidth={3} aria-hidden />
        </span>

        <h1 className="mt-6 text-2xl font-black text-primary-dark">{t('confirmedTitle')}</h1>
        <p className="mt-2 max-w-xs text-sm text-muted-foreground">{t('confirmedBody')}</p>

        {order && (
          <div className="mt-8 w-full max-w-xs rounded-[var(--radius)] bg-card p-4 text-left shadow-sm">
            <p className="text-xs text-muted-foreground">{t('orderIdLabel')}</p>
            <p className="text-sm font-bold">{order.orderNumber}</p>

            {order.deliverySlot && (
              <>
                <p className="mt-3 text-xs text-muted-foreground">{tCheckout('slot')}</p>
                <p className="text-sm font-bold">
                  {tCheckout(SLOT_LABEL_KEYS[order.deliverySlot])} ·{' '}
                  {format.dateTime(new Date(order.placedAt), { day: 'numeric', month: 'short' })}
                </p>
              </>
            )}
          </div>
        )}
      </div>

      <div className="mt-8 space-y-3">
        <Link
          href={`/orders/${orderId}`}
          className="flex h-12 w-full items-center justify-center rounded-[var(--radius)] bg-primary text-base font-bold text-primary-foreground"
        >
          {t('trackOrder')}
        </Link>
        <Link href="/" className="block text-sm font-bold text-primary-dark">
          {t('backToHome')}
        </Link>
      </div>
    </main>
  );
}
