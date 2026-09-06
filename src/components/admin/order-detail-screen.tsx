'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
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
  customerName: string;
  customerPhone: string;
  items: Array<{ id: string; name: string; quantity: number; unitPricePaise: string; totalPaise: string }>;
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
  const t = useTranslations('admin.orders');
  const tc = useTranslations('admin.common');
  const tStatus = useTranslations('orders.status');
  const format = useFormatter();
  const queryClient = useQueryClient();

  const [cancelling, setCancelling] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [selectedPartnerId, setSelectedPartnerId] = useState('');
  const [notice, setNotice] = useState<string | null>(null);

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
    onError: () => setNotice(tc('failed')),
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
    onError: () => setNotice(tc('failed')),
  });

  if (detail.isLoading) {
    return (
      <>
        <AdminPageHeader title={t('title')} backHref="/admin/orders" backLabel={tc('back')} />
        <p className="text-sm text-muted-foreground">{tc('loading')}</p>
      </>
    );
  }

  const order = detail.data?.order;
  if (!order) {
    return (
      <>
        <AdminPageHeader title={t('title')} backHref="/admin/orders" backLabel={tc('back')} />
        <p className="text-sm text-muted-foreground">{tc('empty')}</p>
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
      <AdminPageHeader
        title={order.orderNumber}
        subtitle={`${order.customerName} · ${order.customerPhone}`}
        backHref="/admin/orders"
        backLabel={tc('back')}
        action={
          <span
            className={cn(
              'rounded-full px-2.5 py-1 text-xs font-semibold',
              STATUS_TONE[order.status] ?? 'bg-secondary',
            )}
          >
            {tStatus(order.status)}
          </span>
        }
      />

      {notice && (
        <p className="mb-4 rounded-[var(--radius)] bg-danger/10 px-4 py-3 text-sm text-danger">{notice}</p>
      )}

      <div className="space-y-4">
        <section className="rounded-[var(--radius)] border border-border bg-card p-4">
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

        <section>
          <h2 className="mb-2 text-sm font-bold">{t('items')}</h2>
          {/* A plain flex-row list, not AdminTable: that component forces a
              640px table min-width (right for a dense many-column table
              like Orders/Inventory, wrong here) — on a phone, only the
              "name" column stayed within the visible width and quantity +
              price scrolled off-screen unnoticed. This wraps at any width
              instead, matching the customer-facing order detail's own item
              row (src/components/shop/order-detail.tsx). */}
          <ul className="divide-y divide-border overflow-hidden rounded-[var(--radius)] border border-border bg-card">
            {order.items.map((item) => (
              <li key={item.id} className="flex items-center gap-3 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{item.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {item.quantity} × {formatPaise(paise(item.unitPricePaise), { hidePaise: true })}
                  </p>
                </div>
                <p className="shrink-0 text-sm font-semibold">
                  {formatPaise(paise(item.totalPaise), { hidePaise: true })}
                </p>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-[var(--radius)] border border-border bg-card p-4">
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

        <section className="rounded-[var(--radius)] border border-border bg-card p-4">
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
          <section className="rounded-[var(--radius)] border border-border bg-card p-4">
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

        <section className="rounded-[var(--radius)] border border-border bg-card p-4">
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
