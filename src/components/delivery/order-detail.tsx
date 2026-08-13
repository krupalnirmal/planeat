'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Camera, ChevronLeft, MapPin, Phone } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import { Link } from '@/i18n/navigation';
import { StatusPill } from '@/components/delivery/dashboard';
import { ApiClientError, api } from '@/lib/api/client';
import { formatPaise, paise } from '@/lib/money';

type AssignmentStatus = 'ASSIGNED' | 'PICKED_UP' | 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'FAILED';

interface OrderDetailResponse {
  order: {
    orderId: string;
    orderNumber: string;
    status: AssignmentStatus;
    customerName: string;
    customerPhone: string;
    address: {
      line1: string;
      line2: string | null;
      landmark: string | null;
      city: string;
      pincode: string;
      mapUrl: string | null;
    };
    items: Array<{ name: string; displayQuantity: string; slot: 'MORNING' | 'EVENING' | null }>;
    totalPaise: string;
    isCod: boolean;
    failureReason: string | null;
  };
}

/**
 * M10 — "Order detail: customer name, click-to-call, address, map link, item
 * checklist" plus the status actions that move it forward.
 *
 * The delivery OTP never appears on this screen. It is read out BY the
 * customer, from THEIR screen (`src/components/shop/order-detail.tsx`) — a
 * rider who could see it here would make the whole check meaningless.
 */
export function DeliveryOrderDetail({ orderId }: { orderId: string }) {
  const t = useTranslations('delivery');
  const tc = useTranslations('common');
  const queryClient = useQueryClient();

  const [otp, setOtp] = useState('');
  const [failReason, setFailReason] = useState('');
  const [showFailForm, setShowFailForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const detail = useQuery({
    queryKey: ['delivery-order', orderId],
    queryFn: () => api.get<OrderDetailResponse>(`/api/delivery/orders/${orderId}`),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['delivery-order', orderId] });
    void queryClient.invalidateQueries({ queryKey: ['delivery-orders'] });
    void queryClient.invalidateQueries({ queryKey: ['delivery-summary'] });
  };

  const advance = useMutation({
    mutationFn: (input: { to: AssignmentStatus; otp?: string; proofImageUrl?: string; failureReason?: string }) =>
      api.patch(`/api/delivery/orders/${orderId}/status`, input),
    onSuccess: () => {
      setError(null);
      setOtp('');
      setShowFailForm(false);
      setFailReason('');
      invalidate();
    },
    onError: (err) => setError(err instanceof ApiClientError ? err.message : tc('failed')),
  });

  const uploadAndDeliver = useMutation({
    mutationFn: async (file: File) => {
      const response = await fetch('/api/uploads/photo?folder=delivery-proof', {
        method: 'POST',
        headers: { 'content-type': file.type },
        body: file,
        credentials: 'same-origin',
      });
      const payload = await response.json();
      if (!payload.success) {
        throw new ApiClientError(payload.error.code, payload.error.message, response.status);
      }
      return (payload.data as { url: string }).url;
    },
    onSuccess: (url) => advance.mutate({ to: 'DELIVERED', proofImageUrl: url }),
    onError: (err) => setError(err instanceof ApiClientError ? err.message : tc('failed')),
  });

  if (detail.isLoading) {
    return <p className="text-sm text-muted-foreground">{tc('loading')}</p>;
  }

  if (!detail.data) {
    return (
      <div className="text-center">
        <p className="text-sm text-muted-foreground">{t('notFound')}</p>
        <Link href="/delivery" className="mt-3 inline-block text-sm font-semibold text-primary">
          {tc('back')}
        </Link>
      </div>
    );
  }

  const { order } = detail.data;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Link
          href="/delivery"
          aria-label={tc('back')}
          className="grid size-11 shrink-0 place-items-center rounded-full bg-card"
        >
          <ChevronLeft className="size-4" aria-hidden />
        </Link>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold">{order.orderNumber}</p>
        </div>
        <StatusPill status={order.status} />
      </div>

      {error && (
        <p className="rounded-[var(--radius)] bg-danger/10 px-3 py-2 text-xs text-danger">
          {error}
        </p>
      )}

      {/* ── Customer */}
      <section className="rounded-[var(--radius)] bg-card p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold">{order.customerName}</p>
          <a
            href={`tel:${order.customerPhone}`}
            className="flex h-9 items-center gap-1.5 rounded-full bg-primary px-3 text-xs font-bold text-primary-foreground"
          >
            <Phone className="size-3.5" aria-hidden />
            {t('call')}
          </a>
        </div>

        <p className="mt-3 flex gap-2 text-xs leading-relaxed text-muted-foreground">
          <MapPin className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
          <span>
            {[order.address.line1, order.address.line2, order.address.landmark]
              .filter(Boolean)
              .join(', ')}
            <br />
            {order.address.city} — {order.address.pincode}
          </span>
        </p>

        {order.address.mapUrl && (
          <a
            href={order.address.mapUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-block text-xs font-semibold text-primary"
          >
            {t('openMap')}
          </a>
        )}

        {order.isCod && (
          <p className="mt-3 rounded-[var(--radius)] bg-secondary px-3 py-2 text-xs font-semibold">
            {t('codCollect', { amount: formatPaise(paise(order.totalPaise)) })}
          </p>
        )}
      </section>

      {/* ── Item checklist */}
      <section className="rounded-[var(--radius)] bg-card p-4">
        <h2 className="mb-2 text-sm font-semibold">{t('items')}</h2>
        <ul className="space-y-1.5">
          {order.items.map((item, index) => (
            <li key={index} className="flex items-center justify-between text-sm">
              <span>
                {item.name}
                {item.slot && (
                  <span className="ml-1.5 text-[10px] text-muted-foreground">
                    ({t(`slotLabel.${item.slot}`)})
                  </span>
                )}
              </span>
              <span className="font-medium tabular-nums">{item.displayQuantity}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* ── Actions */}
      {order.status === 'ASSIGNED' && (
        <ActionButton
          label={t('markPickedUp')}
          onClick={() => advance.mutate({ to: 'PICKED_UP' })}
          pending={advance.isPending}
        />
      )}

      {order.status === 'PICKED_UP' && (
        <ActionButton
          label={t('markOutForDelivery')}
          onClick={() => advance.mutate({ to: 'OUT_FOR_DELIVERY' })}
          pending={advance.isPending}
        />
      )}

      {order.status === 'OUT_FOR_DELIVERY' && !showFailForm && (
        <section className="space-y-3 rounded-[var(--radius)] border-2 border-dashed border-primary/40 bg-primary/5 p-4">
          <p className="text-sm font-semibold">{t('confirmDeliveryTitle')}</p>
          <p className="text-xs text-muted-foreground">{t('otpHint')}</p>
          <div className="flex gap-2">
            <input
              inputMode="numeric"
              maxLength={4}
              value={otp}
              onChange={(event) => setOtp(event.target.value.replace(/\D/g, ''))}
              placeholder="0000"
              className="h-11 w-24 rounded-[var(--radius)] border border-border bg-background px-3 text-center text-lg font-bold tracking-widest outline-none"
            />
            <button
              type="button"
              disabled={otp.length !== 4 || advance.isPending}
              onClick={() => advance.mutate({ to: 'DELIVERED', otp })}
              className="h-11 flex-1 rounded-[var(--radius)] bg-primary text-sm font-bold text-primary-foreground disabled:opacity-50"
            >
              {t('confirmDelivery')}
            </button>
          </div>

          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            {t('or')}
            <span className="h-px flex-1 bg-border" />
          </div>

          <input
            ref={fileInput}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            capture="environment"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) uploadAndDeliver.mutate(file);
            }}
          />
          <button
            type="button"
            disabled={uploadAndDeliver.isPending}
            onClick={() => fileInput.current?.click()}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-[var(--radius)] border border-border text-sm font-semibold disabled:opacity-50"
          >
            <Camera className="size-4" aria-hidden />
            {uploadAndDeliver.isPending ? tc('loading') : t('proofPhoto')}
          </button>

          <button
            type="button"
            onClick={() => setShowFailForm(true)}
            className="w-full text-center text-xs font-semibold text-danger"
          >
            {t('markFailed')}
          </button>
        </section>
      )}

      {order.status === 'OUT_FOR_DELIVERY' && showFailForm && (
        <section className="space-y-3 rounded-[var(--radius)] border border-danger/40 bg-danger/5 p-4">
          <p className="text-sm font-semibold text-danger">{t('markFailed')}</p>
          <textarea
            value={failReason}
            onChange={(event) => setFailReason(event.target.value)}
            placeholder={t('failReasonPlaceholder')}
            rows={2}
            className="w-full rounded-[var(--radius)] border border-border bg-background p-2.5 text-sm outline-none"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setShowFailForm(false)}
              className="h-10 flex-1 rounded-[var(--radius)] border border-border text-xs font-semibold"
            >
              {tc('cancel')}
            </button>
            <button
              type="button"
              disabled={failReason.trim().length < 3 || advance.isPending}
              onClick={() => advance.mutate({ to: 'FAILED', failureReason: failReason.trim() })}
              className="h-10 flex-1 rounded-[var(--radius)] bg-danger text-xs font-bold text-white disabled:opacity-50"
            >
              {tc('save')}
            </button>
          </div>
        </section>
      )}

      {order.status === 'DELIVERED' && (
        <p className="rounded-[var(--radius)] bg-success/10 px-4 py-3 text-center text-sm font-semibold text-success">
          {t('deliveredNotice')}
        </p>
      )}

      {order.status === 'FAILED' && (
        <p className="rounded-[var(--radius)] bg-danger/10 px-4 py-3 text-center text-sm text-danger">
          {order.failureReason ?? t('failedNotice')}
        </p>
      )}
    </div>
  );
}

function ActionButton({
  label,
  onClick,
  pending,
}: {
  label: string;
  onClick: () => void;
  pending: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className="h-12 w-full rounded-[var(--radius)] bg-primary text-sm font-bold text-primary-foreground disabled:opacity-50"
    >
      {label}
    </button>
  );
}
