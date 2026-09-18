'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, ImageIcon, Loader2, User } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import { Link } from '@/i18n/navigation';
import { AdminPageHeader } from '@/components/admin/admin-shell';
import { STATUS_TONE } from '@/components/admin/orders-screen';
import { api } from '@/lib/api/client';
import { formatPaise, paise } from '@/lib/money';
import { cn } from '@/lib/utils';
import type { OrderStatus } from '@/generated/prisma/enums';

/**
 * M9 — order detail: items/bill/rider/history, status changes, cancel with
 * refund, manual single-order rider assignment. Every action here reuses a
 * backend path that already exists (`POST /api/admin/orders/:id/status`,
 * `POST /api/admin/riders/suggest`) — this screen is the missing UI over an
 * otherwise-complete API.
 *
 * Dashboard v2 (session 2026-09-18) reuses this exact component as the
 * right-hand detail panel for the Orders/Revenue/Payments/Deliveries tabs —
 * `variant="inline"` adds a compact order#/status/customer header and the
 * "View Details"/"Refill Customer's Cart" action row on top of the same
 * body every section below already renders; `variant="page"` (the
 * standalone `/admin/orders/[id]` route, unchanged) keeps the existing
 * `AdminPageHeader`. One query, one component — no second copy to drift.
 */

interface OrderDetail {
  id: string;
  orderNumber: string;
  type: string;
  status: OrderStatus;
  paymentMethod: string;
  paymentStatus: string;
  address: {
    label: string;
    line1: string;
    line2: string | null;
    landmark: string | null;
    city: string;
    state: string;
    pincode: string;
  };
  subtotalPaise: string;
  deliveryFeePaise: string;
  discountPaise: string;
  totalPaise: string;
  notes: string | null;
  placedAt: string;
  deliveredAt: string | null;
  cancelledAt: string | null;
  customerId: string;
  customerName: string;
  customerPhone: string;
  items: Array<{
    id: string;
    name: string;
    nameEn: string | null;
    localName: string | null;
    imageUrl: string | null;
    variantLabel: string;
    quantity: number;
    unitPricePaise: string;
    totalPaise: string;
  }>;
  rider: { name: string; phone: string; status: string } | null;
  history: Array<{
    fromStatus: OrderStatus | null;
    toStatus: OrderStatus;
    reason: string | null;
    changedByName: string | null;
    createdAt: string;
  }>;
  nextStatuses: OrderStatus[];
}

interface PartnerOption {
  id: string;
  name: string;
  isAvailable: boolean;
  todayLoad: number;
}

export function AdminOrderDetailScreen({ orderId }: { orderId: string }) {
  return <OrderDetailPanel orderId={orderId} variant="page" />;
}

export function OrderDetailPanel({
  orderId,
  variant = 'inline',
}: {
  orderId: string;
  /** `page` = the standalone `/admin/orders/[id]` route (unchanged
      `AdminPageHeader`); `inline` = the dashboard v2 split-view's right
      panel (compact order#/status/customer header + action row). */
  variant?: 'page' | 'inline';
}) {
  const t = useTranslations('admin.orders');
  const tc = useTranslations('admin.common');
  const te = useTranslations('admin.explorer');
  const tStatus = useTranslations('orders.status');
  const format = useFormatter();
  const queryClient = useQueryClient();

  const [cancelling, setCancelling] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [selectedPartnerId, setSelectedPartnerId] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [noticeTone, setNoticeTone] = useState<'error' | 'info'>('error');

  const detail = useQuery({
    queryKey: ['admin-order', orderId],
    queryFn: () => api.get<{ order: OrderDetail }>(`/api/admin/orders/${orderId}`),
  });

  const needsRider = detail.data !== undefined && detail.data.order.rider === null;
  const partners = useQuery({
    queryKey: ['admin-delivery-partners'],
    queryFn: () => api.get<{ partners: PartnerOption[] }>('/api/admin/delivery-partners'),
    enabled: needsRider,
  });

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ['admin-order', orderId] });
    void queryClient.invalidateQueries({ queryKey: ['admin-orders'] });
  }

  const changeStatus = useMutation({
    mutationFn: (input: { status: OrderStatus; reason?: string }) =>
      api.post(`/api/admin/orders/${orderId}/status`, input),
    onSuccess: () => {
      setCancelling(false);
      setCancelReason('');
      setNotice(null);
      refresh();
    },
    onError: () => {
      setNoticeTone('error');
      setNotice(tc('failed'));
    },
  });

  const assign = useMutation({
    mutationFn: (partnerId: string) =>
      api.post<{ assigned: number }>('/api/admin/riders/suggest', {
        assignments: [{ orderId, partnerId }],
      }),
    onSuccess: () => {
      setSelectedPartnerId('');
      refresh();
    },
    onError: () => {
      setNoticeTone('error');
      setNotice(tc('failed'));
    },
  });

  const refillCart = useMutation({
    mutationFn: () =>
      api.post<{ customerName: string; added: number; skipped: unknown[] }>(
        `/api/admin/orders/${orderId}/refill-cart`,
      ),
    onSuccess: (data) => {
      setNoticeTone('info');
      setNotice(
        data.added > 0
          ? te('refillCartDone', { name: data.customerName, added: data.added })
          : te('refillCartNone'),
      );
    },
    onError: () => {
      setNoticeTone('error');
      setNotice(tc('failed'));
    },
  });

  if (detail.isLoading) {
    return (
      <>
        {variant === 'page' && (
          <AdminPageHeader title={t('title')} backHref="/admin/orders" backLabel={tc('back')} />
        )}
        <p className={cn('text-sm text-muted-foreground', variant === 'inline' && 'p-4')}>{tc('loading')}</p>
      </>
    );
  }

  const order = detail.data?.order;
  if (!order) {
    return (
      <>
        {variant === 'page' && (
          <AdminPageHeader title={t('title')} backHref="/admin/orders" backLabel={tc('back')} />
        )}
        <p className={cn('text-sm text-muted-foreground', variant === 'inline' && 'p-4')}>{tc('empty')}</p>
      </>
    );
  }

  // REFUNDED is deliberately never offered as a plain status button here —
  // unlike CANCELLED (which routes through the full cancelOrder refund
  // flow), a bare status flip to REFUNDED has no wallet-crediting logic
  // behind it at all. Exposing it would look like an admin can refund an
  // order by clicking it, when nothing would actually move. Post-delivery
  // refunds belong to the (separate, not-yet-built) complaints flow.
  const plainStatusActions = order.nextStatuses.filter(
    (s) => s !== 'CANCELLED' && s !== 'REFUNDED',
  );
  const canCancel = order.nextStatuses.includes('CANCELLED');

  return (
    <>
      {variant === 'page' ? (
        <AdminPageHeader
          title={order.orderNumber}
          subtitle={`${order.customerName} · ${order.customerPhone}`}
          backHref="/admin/orders"
          backLabel={tc('back')}
          action={
            <>
              {order.type === 'MEAL_PLAN_DAILY' && (
                <span className="rounded-full bg-tint-green px-2.5 py-1 text-xs font-semibold text-primary-dark">
                  {t('typeLabel.MEAL_PLAN_DAILY')}
                </span>
              )}
              <span
                className={cn(
                  'rounded-full px-2.5 py-1 text-xs font-semibold',
                  STATUS_TONE[order.status] ?? 'bg-secondary',
                )}
              >
                {tStatus(order.status)}
              </span>
            </>
          }
        />
      ) : (
        // The compact header the dashboard's split-view panel needs
        // (order#, status + placed date, then a customer identity card
        // with a "View Profile" link) — the reference mockup's own right
        // panel, built from real fields already on `order` rather than a
        // second query.
        <div className="p-4 pb-0">
          <h2 className="mb-1.5 text-base font-bold">
            {t('orderNumber')} #{order.orderNumber}
          </h2>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <span
              className={cn(
                'flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold',
                STATUS_TONE[order.status] ?? 'bg-secondary',
              )}
            >
              <CheckCircle2 className="size-3.5" aria-hidden />
              {tStatus(order.status)}
            </span>
            <span className="text-xs text-muted-foreground">
              {format.dateTime(new Date(order.placedAt), {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          </div>

          <div className="card-3d mb-4 flex items-start justify-between gap-2 rounded-[var(--radius)] border border-border/60 bg-card p-3">
            <div className="flex min-w-0 items-start gap-2.5">
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-secondary text-muted-foreground">
                <User className="size-4" aria-hidden />
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{order.customerName}</p>
                <p className="text-xs text-muted-foreground">{order.customerPhone}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {[order.address.line1, order.address.line2, order.address.landmark]
                    .filter(Boolean)
                    .join(', ')}
                  , {order.address.city}
                </p>
              </div>
            </div>
            <Link
              href={`/admin/customers/${order.customerId}`}
              className="shrink-0 text-xs font-semibold text-primary"
            >
              {te('viewProfile')}
            </Link>
          </div>
        </div>
      )}

      {notice && (
        <p
          className={cn(
            'rounded-[var(--radius)] px-4 py-3 text-sm',
            noticeTone === 'error' ? 'bg-danger/10 text-danger' : 'bg-primary/5',
            variant === 'inline' ? 'mx-4 mb-4' : 'mb-4',
          )}
        >
          {notice}
        </p>
      )}

      <div className={cn('space-y-4', variant === 'inline' && 'p-4 pt-0')}>
        {/* Inline variant's header card above already shows the address —
            skipping this section there avoids showing it twice. */}
        {variant === 'page' && (
          <section className="card-3d rounded-[var(--radius)] border border-border/60 bg-card p-4">
            <h2 className="mb-2 text-sm font-bold">{t('deliverTo')}</h2>
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{order.address.label}</span> —{' '}
              {[order.address.line1, order.address.line2, order.address.landmark].filter(Boolean).join(', ')},{' '}
              {order.address.city} {order.address.pincode}
            </p>
            {order.notes && (
              <p className="mt-2 text-xs text-muted-foreground">
                {t('notes')}: {order.notes}
              </p>
            )}
          </section>
        )}

        <section>
          <h2 className="mb-2 text-sm font-bold">{t('items')}</h2>
          {/* A plain flex-row list, not AdminTable: that component forces a
              640px table min-width (right for a dense many-column table
              like Orders/Inventory, wrong here) — on a phone, only the
              "name" column stayed within the visible width and quantity +
              price scrolled off-screen unnoticed. This wraps at any width
              instead, matching the customer-facing order detail's own item
              row (src/components/shop/order-detail.tsx). */}
          <ul className="card-3d divide-y divide-border overflow-hidden rounded-[var(--radius)] border border-border/60 bg-card">
            {order.items.map((item) => (
              <li key={item.id} className="flex items-center gap-3 px-3 py-2.5">
                {/* The product's real photo (frozen at order time —
                    `OrderItem.imageSnapshot`, the same field the
                    customer-facing order screen already trusts) rather than
                    a bare name, so "which product is this" never needs a
                    second lookup. */}
                <div className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-[var(--radius)] bg-white">
                  {item.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.imageUrl} alt="" className="size-full object-cover" />
                  ) : (
                    <ImageIcon className="size-5 text-muted-foreground/40" aria-hidden />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  {/* "English (Marathi)" — the same bilingual convention the
                      storefront's own ProductCard and the meal-plan builder
                      use, pulled live from the product (not in the frozen
                      snapshot, which only ever kept one locale's name). */}
                  <p className="truncate text-sm">
                    {item.nameEn ?? item.name}
                    {item.localName && (
                      <span className="font-normal text-muted-foreground"> ({item.localName})</span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {item.quantity} × {item.variantLabel} · {formatPaise(paise(item.unitPricePaise), { hidePaise: true })}
                  </p>
                </div>
                <p className="shrink-0 text-sm font-semibold">
                  {formatPaise(paise(item.totalPaise), { hidePaise: true })}
                </p>
              </li>
            ))}
          </ul>
        </section>

        <section className="card-3d rounded-[var(--radius)] border border-border/60 bg-card p-4">
          <h2 className="mb-2 text-sm font-bold">{t('billSummary')}</h2>
          <dl className="space-y-1 text-sm">
            <BillRow label={t('itemTotal')} value={formatPaise(paise(order.subtotalPaise))} />
            <BillRow label={t('deliveryFee')} value={formatPaise(paise(order.deliveryFeePaise))} />
            {paise(order.discountPaise) > 0n && (
              <BillRow label={t('discount')} value={`− ${formatPaise(paise(order.discountPaise))}`} />
            )}
            <div className="flex justify-between border-t border-border pt-1.5 text-sm font-bold">
              <dt>{t('grandTotal')}</dt>
              <dd>{formatPaise(paise(order.totalPaise))}</dd>
            </div>
            <div className="flex justify-between pt-1 text-xs text-muted-foreground">
              <dt>{t('paymentMethod')}</dt>
              <dd>
                {order.paymentMethod} · {order.paymentStatus}
              </dd>
            </div>
          </dl>
        </section>

        <section className="card-3d rounded-[var(--radius)] border border-border/60 bg-card p-4">
          <h2 className="mb-2 text-sm font-bold">{t('riderTitle')}</h2>
          {order.rider ? (
            <p className="text-sm">
              {order.rider.name} · {order.rider.phone}
            </p>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm text-muted-foreground">{t('noRiderAssigned')}</p>
              <select
                value={selectedPartnerId}
                onChange={(event) => setSelectedPartnerId(event.target.value)}
                className="h-9 rounded-[var(--radius)] border border-border bg-card px-2 text-xs outline-none"
              >
                <option value="">{t('selectRider')}</option>
                {partners.data?.partners
                  .filter((p) => p.isAvailable)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.todayLoad})
                    </option>
                  ))}
              </select>
              <button
                type="button"
                disabled={!selectedPartnerId || assign.isPending}
                onClick={() => assign.mutate(selectedPartnerId)}
                className="flex h-9 items-center gap-1.5 rounded-[var(--radius)] bg-primary px-3 text-xs font-bold text-primary-foreground disabled:opacity-50"
              >
                {assign.isPending && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
                {t('assign')}
              </button>
            </div>
          )}
        </section>

        {(plainStatusActions.length > 0 || canCancel) && (
          <section className="card-3d rounded-[var(--radius)] border border-border/60 bg-card p-4">
            <h2 className="mb-2 text-sm font-bold">{t('changeStatus')}</h2>
            <div className="flex flex-wrap gap-2">
              {plainStatusActions.map((s) => (
                <button
                  key={s}
                  type="button"
                  disabled={changeStatus.isPending}
                  onClick={() => changeStatus.mutate({ status: s })}
                  className="h-9 rounded-[var(--radius)] border border-primary px-3 text-xs font-bold text-primary disabled:opacity-50"
                >
                  {t('markAs', { status: tStatus(s) })}
                </button>
              ))}
              {canCancel && !cancelling && (
                <button
                  type="button"
                  onClick={() => setCancelling(true)}
                  className="h-9 rounded-[var(--radius)] border border-danger px-3 text-xs font-bold text-danger"
                >
                  {t('cancelOrder')}
                </button>
              )}
            </div>

            {cancelling && (
              <div className="mt-3 rounded-[var(--radius)] border border-danger/30 bg-danger/5 p-3">
                <p className="mb-2 text-sm font-semibold">{t('cancelConfirmTitle')}</p>
                <input
                  value={cancelReason}
                  onChange={(event) => setCancelReason(event.target.value)}
                  placeholder={t('cancelReasonLabel')}
                  className="mb-2 h-9 w-full rounded-[var(--radius)] border border-border bg-card px-2 text-xs outline-none"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={changeStatus.isPending}
                    onClick={() =>
                      changeStatus.mutate({ status: 'CANCELLED', reason: cancelReason || undefined })
                    }
                    className="flex h-9 items-center gap-1.5 rounded-[var(--radius)] bg-danger px-3 text-xs font-bold text-white disabled:opacity-50"
                  >
                    {changeStatus.isPending && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
                    {t('confirmCancel')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setCancelling(false)}
                    className="h-9 rounded-[var(--radius)] border border-border px-3 text-xs"
                  >
                    {tc('dismiss')}
                  </button>
                </div>
              </div>
            )}
          </section>
        )}

        <section className="card-3d rounded-[var(--radius)] border border-border/60 bg-card p-4">
          <h2 className="mb-2 text-sm font-bold">{t('statusHistory')}</h2>
          {order.history.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t('noHistory')}</p>
          ) : (
            <ul className="space-y-1.5 text-xs">
              {order.history.map((h, i) => (
                <li key={i} className="text-muted-foreground">
                  <span className="font-semibold text-foreground">{tStatus(h.toStatus)}</span>
                  {' — '}
                  {format.dateTime(new Date(h.createdAt), {
                    day: 'numeric',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                  {h.changedByName && ` · ${h.changedByName}`}
                  {h.reason && ` · ${h.reason}`}
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* The split-view panel's action row (reference mockup) — "View
            Details" is a real link to this same order's standalone page;
            "Refill Customer's Cart" is the admin-safe re-scoping of the
            mockup's "Reorder"/"Create Similar" (see refillCart mutation
            above and the route it calls for why). */}
        {variant === 'inline' && (
          <div className="flex gap-2">
            <Link
              href={`/admin/orders/${order.id}`}
              className="flex h-11 flex-1 items-center justify-center rounded-[var(--radius)] border border-border bg-card text-sm font-bold"
            >
              {te('viewDetails')}
            </Link>
            <button
              type="button"
              onClick={() => refillCart.mutate()}
              disabled={refillCart.isPending}
              className="flex h-11 flex-1 items-center justify-center gap-1.5 rounded-[var(--radius)] bg-primary text-sm font-bold text-primary-foreground disabled:opacity-50"
            >
              {refillCart.isPending && <Loader2 className="size-4 animate-spin" aria-hidden />}
              {te('refillCart')}
            </button>
          </div>
        )}
      </div>
    </>
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
