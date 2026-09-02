'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Check,
  ChevronLeft,
  CircleAlert,
  ImageIcon,
  Map,
  MapPin,
  ShieldCheck,
  ShoppingBag,
} from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import { Link } from '@/i18n/navigation';
import { CenteredState, PageHeader } from '@/components/shop/page-header';
import { ReportIssueForm } from '@/components/shop/report-issue-form';
import { useSession } from '@/hooks/use-session';
import { ApiClientError, api } from '@/lib/api/client';
import { formatPaise, paise } from '@/lib/money';
import { cn } from '@/lib/utils';
import type { OrderStatusValue } from '@/components/shop/order-status-badge';

/**
 * Order detail (M3). Redesigned (session 2026-09-02) to the client's own
 * mockup: a warm cream page, a header pill for the current status, a
 * timeline with per-step Completed/Pending pills and descriptions instead
 * of just labels, and heavily rounded white section cards throughout.
 *
 * The header's colourful vegetable-cluster illustration from the reference
 * isn't included — no clean (unwatermarked) asset for it exists yet, so
 * this reuses the same pale leaf.png the cart screen's header already
 * established, for a consistent decorative language until one is supplied.
 */

const TIMELINE: OrderStatusValue[] = [
  'PLACED',
  'CONFIRMED',
  'PACKED',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
];

// The header pill's tone: forward-progress states read as green regardless
// of which of the five steps the order is at; only the true terminal/negative
// states get their own colour. Deliberately separate from
// order-status-badge.tsx's TONE map, which the timeline below still uses via
// plain text — that map's PLACED is a neutral gray there on purpose, and
// changing it would also recolour the timeline's "Placed" label.
const HEADER_BADGE_TONE: Record<OrderStatusValue, string> = {
  PLACED: 'bg-tint-green text-primary-dark',
  CONFIRMED: 'bg-tint-green text-primary-dark',
  PACKED: 'bg-tint-green text-primary-dark',
  OUT_FOR_DELIVERY: 'bg-tint-green text-primary-dark',
  DELIVERED: 'bg-tint-green text-primary-dark',
  CANCELLED: 'bg-danger/10 text-danger',
  FAILED_DELIVERY: 'bg-danger/10 text-danger',
  REFUNDED: 'bg-secondary text-muted-foreground',
  PAYMENT_PENDING: 'bg-[#FDF3E3] text-warning',
};

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
  const tStatus = useTranslations('orders.status');
  const tCart = useTranslations('cart');
  const tc = useTranslations('common');
  const te = useTranslations('errors');
  const format = useFormatter();
  const queryClient = useQueryClient();
  const { isLoading: sessionLoading } = useSession();

  const [notice, setNotice] = useState<string | null>(null);
  const [reporting, setReporting] = useState(false);

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
    return (
      <>
        <PageHeader title={t('title')} backHref="/orders" backLabel={tc('back')} />
        <main className="pb-2">
          <div className="bg-card px-4 py-8 text-sm text-muted-foreground">{tc('loading')}</div>
        </main>
      </>
    );
  }

  if (detail.isError || !detail.data) {
    return (
      <>
        <PageHeader title={t('title')} backHref="/orders" backLabel={tc('back')} />
        <main className="pb-2">
          <div className="bg-card">
            <CenteredState>
              <p className="text-sm text-muted-foreground">{t('notFound')}</p>
              <Link href="/orders" className="mt-4 inline-block text-sm font-semibold text-primary">
                {tc('back')}
              </Link>
            </CenteredState>
          </div>
        </main>
      </>
    );
  }

  const { order, canCancel, canReportIssue, timelineIndex } = detail.data;
  const cancelled = order.status === 'CANCELLED' || order.status === 'REFUNDED';

  const addressText = [order.address.line1, order.address.line2, order.address.landmark, order.address.city, order.address.pincode]
    .filter(Boolean)
    .join(', ');
  const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addressText)}`;

  return (
    <main className="min-h-dvh space-y-3 bg-accent-faint px-4 pt-4 pb-4">
      {/* Header — same decorative leaf + z-layering approach as the cart
          screen (session 2026-09-02): no overflow-hidden, title/badge above
          the leaf via z-10. */}
      <header className="relative flex items-start justify-between gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element -- small static decorative asset, not worth next/image's setup */}
        <img
          src="/decor/leaf.png"
          alt=""
          aria-hidden
          className="pointer-events-none absolute top-0 right-0 z-0 size-20 object-contain"
        />
        <div className="relative z-10 flex min-w-0 items-start gap-1">
          <Link
            href="/orders"
            aria-label={tc('back')}
            className="mt-1 grid size-9 shrink-0 place-items-center rounded-full"
          >
            <ChevronLeft className="size-5" aria-hidden />
          </Link>
          <div className="min-w-0">
            <h1 className="truncate text-xl font-black">
              {t('orderNumber', { number: order.orderNumber })}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
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
        </div>

        <span
          className={cn(
            'relative z-10 flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold',
            HEADER_BADGE_TONE[order.status],
          )}
        >
          <ShoppingBag className="size-3.5" aria-hidden />
          {tStatus(order.status)}
        </span>
      </header>

      {notice && (
        <div className="card-3d rounded-[var(--radius-2xl)] bg-card px-4 py-3.5">
          <p className="rounded-[var(--radius)] bg-secondary px-3 py-2.5 text-sm">{notice}</p>
        </div>
      )}

      {/* ── Status timeline */}
      {!cancelled && (
        <section className="card-3d rounded-[var(--radius-2xl)] bg-card px-4 py-4">
          <ol className="space-y-0">
            {TIMELINE.map((step, index) => {
              const reached = timelineIndex >= index;
              const isLast = index === TIMELINE.length - 1;
              const description =
                step === 'PLACED'
                  ? format.dateTime(new Date(order.placedAt), {
                      day: 'numeric',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })
                  : t(`stepDesc.${step}`);
              return (
                <li key={step} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <span
                      className={cn(
                        'grid size-7 shrink-0 place-items-center rounded-full',
                        reached
                          ? 'bg-primary text-primary-foreground'
                          : 'border-2 border-border bg-background',
                      )}
                    >
                      {reached && <Check className="size-4" aria-hidden />}
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
                  <div className="flex-1 pb-5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className={cn('text-sm font-bold', !reached && 'text-muted-foreground')}>
                          {tStatus(step)}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
                      </div>
                      <span
                        className={cn(
                          'shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold',
                          reached ? 'bg-tint-green text-primary-dark' : 'bg-accent-faint text-warning',
                        )}
                      >
                        {reached ? t('timelineCompleted') : t('timelinePending')}
                      </span>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      )}

      {/* ── Delivery OTP (M10) — read out to the rider at the door. Never
          shown to the rider's own app; only the customer sees this. */}
      {order.deliveryOtp && (
        <section className="card-3d rounded-[var(--radius-2xl)] bg-card px-4 py-4">
          <div className="rounded-[var(--radius)] border-2 border-dashed border-primary/40 bg-primary/5 p-4 text-center">
            <p className="text-xs text-muted-foreground">
              {order.riderName ? t('deliveryOtpWithRider', { rider: order.riderName }) : t('deliveryOtpHint')}
            </p>
            <p className="mt-1.5 text-3xl font-black tracking-[0.3em]">{order.deliveryOtp}</p>
          </div>
        </section>
      )}

      {/* ── Address */}
      <section className="card-3d rounded-[var(--radius-2xl)] bg-card px-4 py-4">
        <h2 className="text-sm font-bold text-primary-dark">{t('deliveryTo')}</h2>
        <div className="mt-3 flex items-center gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-full bg-tint-green">
            <MapPin className="size-5 text-primary" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-bold">{order.address.label}</p>
            <p className="text-sm text-muted-foreground">
              {[order.address.line1, order.address.line2, order.address.landmark].filter(Boolean).join(', ')}
            </p>
            <p className="text-sm text-muted-foreground">
              {order.address.city} — {order.address.pincode}
            </p>
          </div>
          <a
            href={mapUrl}
            target="_blank"
            rel="noreferrer"
            className="flex shrink-0 flex-col items-center gap-1 text-center text-[11px] font-bold text-primary"
          >
            <span className="grid size-9 place-items-center rounded-full bg-tint-green">
              <Map className="size-4" aria-hidden />
            </span>
            {t('viewOnMap')}
          </a>
        </div>
        {order.notes && (
          <p className="mt-3 rounded-[var(--radius)] bg-secondary px-3 py-2 text-xs">{order.notes}</p>
        )}
      </section>

      {/* ── Items */}
      <section className="card-3d rounded-[var(--radius-2xl)] bg-card px-4 py-4">
        <h2 className="mb-3 text-sm font-bold text-primary-dark">{t('items')}</h2>
        <ul className="space-y-3">
          {order.items.map((item) => (
            <li key={item.id} className="flex items-center gap-3">
              <span className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-[var(--radius-md)] bg-secondary">
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
      <section className="card-3d rounded-[var(--radius-2xl)] bg-card px-4 py-4">
        <h2 className="mb-3 text-sm font-bold text-primary-dark">{tCart('billSummary')}</h2>
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
          <div className="flex justify-between border-t border-dashed border-border pt-2.5 text-base font-bold">
            <dt>{tCart('grandTotal')}</dt>
            <dd className="text-primary-dark">{formatPaise(paise(order.totalPaise))}</dd>
          </div>
          <div className="flex justify-between pt-1 text-xs text-muted-foreground">
            <dt>{t('paymentMethod')}</dt>
            <dd>{t(`payment.${order.paymentMethod}`)}</dd>
          </div>
        </dl>

        <div className="relative mt-4 flex items-center gap-2.5 overflow-hidden rounded-[var(--radius-xl)] bg-tint-green px-4 py-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- small static decorative asset, not worth next/image's setup */}
          <img
            src="/decor/leaf.png"
            alt=""
            aria-hidden
            className="pointer-events-none absolute -right-2 -bottom-4 size-16 object-contain"
          />
          <span className="relative grid size-8 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground">
            <ShieldCheck className="size-4" aria-hidden />
          </span>
          <div className="relative min-w-0">
            <p className="text-sm font-bold text-primary-dark">{t('securePayment')}</p>
            <p className="text-xs text-primary-dark/70">{t('securePaymentHint')}</p>
          </div>
        </div>
      </section>

      {/* ── Actions */}
      {(canCancel || (canReportIssue && !reporting) || reporting) && (
        <div className="card-3d rounded-[var(--radius-2xl)] bg-card px-4 py-4">
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
      )}
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
