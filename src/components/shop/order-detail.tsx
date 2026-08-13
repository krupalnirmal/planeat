'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ChevronLeft, CircleAlert, ImageIcon, MapPin, PartyPopper } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { Link } from '@/i18n/navigation';
import { OrderStatusBadge, type OrderStatusValue } from '@/components/shop/order-status-badge';
import { ReportIssueForm } from '@/components/shop/report-issue-form';
import { useSession } from '@/hooks/use-session';
import { ApiClientError, api } from '@/lib/api/client';
import { formatPaise, paise } from '@/lib/money';
import { cn } from '@/lib/utils';

/** Order detail (M3). */

const TIMELINE: OrderStatusValue[] = [
  'PLACED',
  'CONFIRMED',
  'PACKED',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
];

interface OrderDetailResponse {
  order: {
    id: string;
    orderNumber: string;
    status: OrderStatusValue;
    paymentMethod: 'WALLET' | 'RAZORPAY' | 'COD';
    paymentStatus: string;
    address: {
      label: string;
      line1: string;
      line2: string | null;
      landmark: string | null;
      city: string;
      pincode: string;
    };
    subtotalPaise: string;
    deliveryFeePaise: string;
    handlingFeePaise: string;
    discountPaise: string;
    totalPaise: string;
    notes: string | null;
    placedAt: string;
    deliveryOtp: string | null;
    riderName: string | null;
    items: Array<{
      id: string;
      name: string;
      imageUrl: string | null;
      quantity: number;
      unitPricePaise: string;
      totalPaise: string;
    }>;
  };
  canCancel: boolean;
  canReportIssue: boolean;
  timelineIndex: number;
}

export function OrderDetail({ orderId }: { orderId: string }) {
  const t = useTranslations('orders');
  const tCart = useTranslations('cart');
  const tc = useTranslations('common');
  const te = useTranslations('errors');
  const format = useFormatter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { isLoading: sessionLoading } = useSession();

  const [notice, setNotice] = useState<string | null>(null);
  const [reporting, setReporting] = useState(false);

  const justPlaced = searchParams.get('placed') === '1';

  const detail = useQuery({
    queryKey: ['order', orderId],
    queryFn: () => api.get<OrderDetailResponse>(`/api/orders/${orderId}`),
  });

  const cancel = useMutation({
    mutationFn: () => api.post<{ refundedPaise: string }>(`/api/orders/${orderId}/cancel`, {}),
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: ['order', orderId] });
      void queryClient.invalidateQueries({ queryKey: ['orders'] });
      const refunded = paise(data.refundedPaise);
      setNotice(
        refunded > 0n
          ? `${t('cancelled')} · ${t('refunded', { amount: formatPaise(refunded) })}`
          : t('cancelled'),
      );
    },
    onError: (err) => {
      setNotice(err instanceof ApiClientError ? err.message : te('generic'));
    },
  });

  if (sessionLoading || detail.isLoading) {
    return <main className="px-4 py-8 text-sm text-muted-foreground">{tc('loading')}</main>;
  }

  if (detail.isError || !detail.data) {
    return (
      <main className="px-6 py-16 text-center">
        <p className="text-sm text-muted-foreground">{t('notFound')}</p>
        <Link href="/orders" className="mt-4 inline-block text-sm font-semibold text-primary">
          {tc('back')}
        </Link>
      </main>
    );
  }

  const { order, canCancel, canReportIssue, timelineIndex } = detail.data;
  const cancelled = order.status === 'CANCELLED' || order.status === 'REFUNDED';

  return (
    <main className="pb-6">
      <header className="sticky top-0 z-30 flex items-center gap-2 border-b border-border bg-card px-3 py-3">
        <Link
          href="/orders"
          aria-label={tc('back')}
          className="grid size-11 shrink-0 place-items-center rounded-full"
        >
          <ChevronLeft className="size-5" aria-hidden />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-bold">
            {t('orderNumber', { number: order.orderNumber })}
          </h1>
          <p className="text-xs text-muted-foreground">
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
      </header>

      <div className="px-4 pt-4">
        {justPlaced && !cancelled && (
          <section className="mb-4 flex items-start gap-3 rounded-[var(--radius)] bg-primary/5 px-4 py-3">
            <PartyPopper className="mt-0.5 size-5 shrink-0 text-success" aria-hidden />
            <div>
              <p className="text-sm font-semibold text-success">{t('successTitle')}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{t('successBody')}</p>
            </div>
          </section>
        )}

        {notice && (
          <p className="mb-4 rounded-[var(--radius)] bg-secondary px-3 py-2.5 text-sm">{notice}</p>
        )}

        {/* ── Status timeline */}
        {!cancelled && (
          <section className="mb-4 rounded-[var(--radius)] bg-card p-4">
            <ol className="space-y-0">
              {TIMELINE.map((step, index) => {
                const reached = timelineIndex >= index;
                const isLast = index === TIMELINE.length - 1;
                return (
                  <li key={step} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <span
                        className={cn(
                          'grid size-6 shrink-0 place-items-center rounded-full border-2',
                          reached
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-border bg-background',
                        )}
                      >
                        {reached && <Check className="size-3.5" aria-hidden />}
                      </span>
                      {!isLast && (
                        <span
                          className={cn(
                            'w-0.5 flex-1',
                            timelineIndex > index ? 'bg-primary' : 'bg-border',
                          )}
                        />
                      )}
                    </div>
                    <span
                      className={cn(
                        'pb-5 text-sm',
                        reached ? 'font-medium' : 'text-muted-foreground',
                      )}
                    >
                      <OrderStatusBadge status={step} className="bg-transparent px-0" />
                    </span>
                  </li>
                );
              })}
            </ol>
          </section>
        )}

        {/* ── Delivery OTP (M10) — read out to the rider at the door. Never
            shown to the rider's own app; only the customer sees this. */}
        {order.deliveryOtp && (
          <section className="mb-4 rounded-[var(--radius)] border-2 border-dashed border-primary/40 bg-primary/5 p-4 text-center">
            <p className="text-xs text-muted-foreground">
              {order.riderName ? t('deliveryOtpWithRider', { rider: order.riderName }) : t('deliveryOtpHint')}
            </p>
            <p className="mt-1.5 text-3xl font-black tracking-[0.3em]">{order.deliveryOtp}</p>
          </section>
        )}

        {/* ── Address */}
        <section className="mb-4 rounded-[var(--radius)] bg-card p-4">
          <h2 className="text-sm font-semibold">{t('deliveryTo')}</h2>
          <p className="mt-2 flex gap-2 text-xs leading-relaxed text-muted-foreground">
            <MapPin className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
            <span>
              <span className="block font-medium text-foreground">{order.address.label}</span>
              {[order.address.line1, order.address.line2, order.address.landmark]
                .filter(Boolean)
                .join(', ')}
              <br />
              {order.address.city} — {order.address.pincode}
            </span>
          </p>
          {order.notes && (
            <p className="mt-3 rounded-[var(--radius)] bg-secondary px-3 py-2 text-xs">
              {order.notes}
            </p>
          )}
        </section>

        {/* ── Items */}
        <section className="mb-4 rounded-[var(--radius)] bg-card p-4">
          <h2 className="mb-3 text-sm font-semibold">{t('items')}</h2>
          <ul className="space-y-3">
            {order.items.map((item) => (
              <li key={item.id} className="flex items-center gap-3">
                <span className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-[calc(var(--radius)-6px)] bg-secondary">
                  {item.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.imageUrl} alt="" aria-hidden className="size-full object-cover" />
                  ) : (
                    <ImageIcon className="size-5 text-muted-foreground/40" aria-hidden />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{item.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {item.quantity} × {formatPaise(paise(item.unitPricePaise), { hidePaise: true })}
                  </span>
                </span>
                <span className="text-sm font-semibold">
                  {formatPaise(paise(item.totalPaise), { hidePaise: true })}
                </span>
              </li>
            ))}
          </ul>
        </section>

        {/* ── Bill */}
        <section className="mb-4 rounded-[var(--radius)] bg-card p-4">
          <h2 className="mb-3 text-sm font-semibold">{tCart('billSummary')}</h2>
          <dl className="space-y-2 text-sm">
            <BillRow label={tCart('itemTotal')} value={formatPaise(paise(order.subtotalPaise))} />
            <BillRow
              label={tCart('deliveryFee')}
              value={
                paise(order.deliveryFeePaise) === 0n
                  ? tCart('free')
                  : formatPaise(paise(order.deliveryFeePaise))
              }
            />
            {paise(order.discountPaise) > 0n && (
              <BillRow
                label={tCart('discount')}
                value={`− ${formatPaise(paise(order.discountPaise))}`}
              />
            )}
            <div className="flex justify-between border-t border-border pt-2.5 text-base font-bold">
              <dt>{tCart('grandTotal')}</dt>
              <dd>{formatPaise(paise(order.totalPaise))}</dd>
            </div>
            <div className="flex justify-between pt-1 text-xs text-muted-foreground">
              <dt>{t('paymentMethod')}</dt>
              <dd>{t(`payment.${order.paymentMethod}`)}</dd>
            </div>
          </dl>
        </section>

        {/* ── Actions */}
        {canCancel && (
          <button
            type="button"
            onClick={() => {
              if (confirm(t('cancelConfirm'))) cancel.mutate();
            }}
            disabled={cancel.isPending}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-[var(--radius)] border border-danger text-sm font-semibold text-danger disabled:opacity-50"
          >
            <CircleAlert className="size-4" aria-hidden />
            {t('cancel')}
          </button>
        )}

        {canReportIssue && !reporting && (
          <button
            type="button"
            onClick={() => setReporting(true)}
            className="mt-3 flex h-12 w-full items-center justify-center rounded-[var(--radius)] border border-border text-sm font-semibold"
          >
            {t('reportIssue')}
          </button>
        )}

        {reporting && (
          <div className="mt-4">
            <ReportIssueForm
              orderId={order.id}
              orderTotalPaise={order.totalPaise}
              onDone={(message) => {
                setReporting(false);
                setNotice(message);
                void queryClient.invalidateQueries({ queryKey: ['order', orderId] });
              }}
              onCancel={() => setReporting(false)}
            />
          </div>
        )}
      </div>
    </main>
  );
}

function BillRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
