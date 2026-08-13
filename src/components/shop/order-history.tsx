'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ImageIcon, Package, RotateCcw } from 'lucide-react';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { Link, useRouter } from '@/i18n/navigation';
import { OrderStatusBadge, type OrderStatusValue } from '@/components/shop/order-status-badge';
import { CART_QUERY_KEY } from '@/hooks/use-cart';
import { useSession } from '@/hooks/use-session';
import { api, qs } from '@/lib/api/client';
import { formatPaise, paise } from '@/lib/money';

/** Order history (M3): list, status, reorder. */

interface OrderSummary {
  id: string;
  orderNumber: string;
  status: OrderStatusValue;
  paymentMethod: 'WALLET' | 'RAZORPAY' | 'COD';
  totalPaise: string;
  itemCount: number;
  placedAt: string;
  previewItems: Array<{ name: string; imageUrl: string | null }>;
}

export function OrderHistory() {
  const t = useTranslations('orders');
  const tc = useTranslations('common');
  const te = useTranslations('errors');
  const format = useFormatter();
  const locale = useLocale();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { isLoggedIn, isLoading: sessionLoading } = useSession();

  const [notice, setNotice] = useState<string | null>(null);

  const orders = useQuery({
    queryKey: ['orders'],
    queryFn: () => api.get<{ orders: OrderSummary[] }>('/api/orders'),
    enabled: isLoggedIn,
  });

  const reorder = useMutation({
    mutationFn: (orderId: string) =>
      api.post<{ added: number; skipped: Array<{ name: string }> }>(
        `/api/orders/${orderId}/reorder${qs({ locale })}`,
      ),
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: CART_QUERY_KEY });
      setNotice(
        data.skipped.length > 0
          ? t('reorderSkipped', { count: data.skipped.length })
          : t('reordered'),
      );
    },
    onError: () => setNotice(te('generic')),
  });

  if (sessionLoading) {
    return <main className="px-4 py-8 text-sm text-muted-foreground">{tc('loading')}</main>;
  }

  if (!isLoggedIn) {
    return (
      <main className="px-6 py-16 text-center">
        <p className="text-sm text-muted-foreground">{te('unauthorized')}</p>
        <button
          type="button"
          onClick={() => router.push('/login?next=/orders')}
          className="mt-4 h-12 w-full rounded-[var(--radius)] bg-primary text-sm font-bold text-primary-foreground"
        >
          {tc('next')}
        </button>
      </main>
    );
  }

  const list = orders.data?.orders ?? [];

  return (
    <main className="px-4 py-4">
      <h1 className="mb-4 text-xl font-bold">{t('title')}</h1>

      {notice && (
        <p className="mb-4 rounded-[var(--radius)] bg-primary/5 px-3 py-2.5 text-sm text-success">
          {notice}
        </p>
      )}

      {orders.isLoading && <p className="text-sm text-muted-foreground">{tc('loading')}</p>}

      {!orders.isLoading && list.length === 0 && (
        <div className="flex flex-col items-center py-16 text-center">
          <Package className="size-12 text-muted-foreground/30" aria-hidden />
          <p className="mt-4 text-sm font-medium">{t('empty')}</p>
          <Link
            href="/"
            className="mt-6 flex h-12 w-full max-w-xs items-center justify-center rounded-[var(--radius)] bg-primary text-sm font-bold text-primary-foreground"
          >
            {tc('next')}
          </Link>
        </div>
      )}

      <ul className="space-y-3">
        {list.map((order) => (
          <li key={order.id} className="rounded-[var(--radius)] bg-card p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold">
                  {t('orderNumber', { number: order.orderNumber })}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {t('placedOn', {
                    date: format.dateTime(new Date(order.placedAt), {
                      day: 'numeric',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    }),
                  })}
                </p>
              </div>
              <OrderStatusBadge status={order.status} />
            </div>

            <div className="mt-3 flex items-center gap-2">
              {order.previewItems.map((item, index) => (
                <span
                  key={`${order.id}-${index}`}
                  className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-[calc(var(--radius)-6px)] bg-secondary"
                >
                  {item.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.imageUrl} alt="" aria-hidden className="size-full object-cover" />
                  ) : (
                    <ImageIcon className="size-4 text-muted-foreground/40" aria-hidden />
                  )}
                </span>
              ))}
              <span className="text-xs text-muted-foreground">
                {t('items')}: {order.itemCount}
              </span>
            </div>

            <div className="mt-3 flex items-center justify-between gap-3 border-t border-border pt-3">
              <span className="text-sm font-bold">{formatPaise(paise(order.totalPaise))}</span>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => reorder.mutate(order.id)}
                  disabled={reorder.isPending}
                  className="flex h-11 items-center gap-1.5 rounded-[var(--radius)] border border-border px-3 text-xs font-semibold disabled:opacity-50"
                >
                  <RotateCcw className="size-3.5" aria-hidden />
                  {t('reorder')}
                </button>
                <Link
                  href={`/orders/${order.id}`}
                  className="flex h-11 items-center rounded-[var(--radius)] border border-primary px-3 text-xs font-bold text-primary"
                >
                  {t('viewDetails')}
                </Link>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
