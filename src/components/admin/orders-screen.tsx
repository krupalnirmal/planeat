'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bike, Loader2 } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import { AdminPageHeader, AdminTable } from '@/components/admin/admin-shell';
import { api, qs } from '@/lib/api/client';
import { formatPaise, paise } from '@/lib/money';
import { cn } from '@/lib/utils';

/**
 * M9 — Orders, and B12's rider assignment.
 *
 *   "The system suggests; the owner confirms with one tap. Include an 'Assign
 *    all suggested' bulk button. No auto-assignment."
 *
 * So the suggestion panel is explicitly a proposal: each row shows who would
 * be assigned and why, and nothing is written until the owner presses the
 * button.
 */

interface OrderRow {
  id: string;
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  type: string;
  status: string;
  paymentMethod: string;
  paymentStatus: string;
  totalPaise: string;
  itemCount: number;
  placedAt: string;
  riderName: string | null;
  pincode: string;
}

interface Suggestion {
  orderId: string;
  orderNumber: string;
  pincode: string;
  suggestedPartnerId: string | null;
  suggestedPartnerName: string | null;
  rationale: string;
}

const STATUS_TONE: Record<string, string> = {
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

export function AdminOrdersScreen() {
  const t = useTranslations('admin.orders');
  const tc = useTranslations('admin.common');
  const tStatus = useTranslations('orders.status');
  const format = useFormatter();
  const queryClient = useQueryClient();

  const [unassignedOnly, setUnassignedOnly] = useState(false);
  const [query, setQuery] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const orders = useQuery({
    queryKey: ['admin-orders', unassignedOnly, query],
    queryFn: () =>
      api.get<{ orders: OrderRow[] }>(
        `/api/admin/orders${qs({
          unassignedOnly: unassignedOnly ? 'true' : undefined,
          query: query || undefined,
          perPage: 50,
        })}`,
      ),
  });

  const suggestions = useQuery({
    queryKey: ['admin-rider-suggestions'],
    queryFn: () => api.get<{ suggestions: Suggestion[] }>('/api/admin/riders/suggest'),
    enabled: showSuggestions,
  });

  const assignAll = useMutation({
    mutationFn: (assignments: Array<{ orderId: string; partnerId: string }>) =>
      api.post<{ assigned: number }>('/api/admin/riders/suggest', { assignments }),
    onSuccess: (data) => {
      setNotice(t('assigned', { count: data.assigned }));
      void queryClient.invalidateQueries({ queryKey: ['admin-orders'] });
      void queryClient.invalidateQueries({ queryKey: ['admin-rider-suggestions'] });
    },
    onError: () => setNotice(tc('failed')),
  });

  const assignable = (suggestions.data?.suggestions ?? []).filter(
    (suggestion): suggestion is Suggestion & { suggestedPartnerId: string } =>
      suggestion.suggestedPartnerId !== null,
  );

  return (
    <>
      <AdminPageHeader
        title={t('title')}
        action={
          <button
            type="button"
            onClick={() => setShowSuggestions((value) => !value)}
            className="flex h-10 items-center gap-1.5 rounded-[var(--radius)] border border-primary px-3 text-xs font-bold text-primary"
          >
            <Bike className="size-3.5" aria-hidden />
            {t('suggestRiders')}
          </button>
        }
      />

      {notice && (
        <p className="mb-4 rounded-[var(--radius)] bg-primary/5 px-4 py-3 text-sm">{notice}</p>
      )}

      {/* ── B12: a proposal, not an action. */}
      {showSuggestions && (
        <section className="mb-5 rounded-[var(--radius)] border border-primary/30 bg-card p-4">
          {suggestions.isLoading ? (
            <p className="text-sm text-muted-foreground">{tc('loading')}</p>
          ) : assignable.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('noSuggestions')}</p>
          ) : (
            <>
              <ul className="mb-3 space-y-1.5">
                {assignable.map((suggestion) => (
                  <li
                    key={suggestion.orderId}
                    className="flex flex-wrap items-center justify-between gap-2 text-sm"
                  >
                    <span className="font-mono text-xs text-muted-foreground">
                      {suggestion.orderNumber} · {suggestion.pincode}
                    </span>
                    <span className="font-semibold">{suggestion.suggestedPartnerName}</span>
                  </li>
                ))}
              </ul>

              <button
                type="button"
                onClick={() =>
                  assignAll.mutate(
                    assignable.map((suggestion) => ({
                      orderId: suggestion.orderId,
                      partnerId: suggestion.suggestedPartnerId,
                    })),
                  )
                }
                disabled={assignAll.isPending}
                className="flex h-10 items-center gap-2 rounded-[var(--radius)] bg-primary px-4 text-xs font-bold text-primary-foreground disabled:opacity-50"
              >
                {assignAll.isPending && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
                {t('assignAll')} ({assignable.length})
              </button>
            </>
          )}
        </section>
      )}

      <div className="mb-3 flex flex-wrap gap-2">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={tc('search')}
          className="h-10 min-w-48 flex-1 rounded-[var(--radius)] border border-border bg-card px-3 text-sm outline-none"
        />
        {(
          [
            [false, t('filterAll')],
            [true, t('filterUnassigned')],
          ] as const
        ).map(([value, label]) => (
          <button
            key={String(value)}
            type="button"
            onClick={() => setUnassignedOnly(value)}
            className={cn(
              'h-10 rounded-[var(--radius)] px-3 text-xs font-medium',
              unassignedOnly === value
                ? 'bg-primary text-primary-foreground font-semibold'
                : 'border border-border bg-card text-muted-foreground',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {orders.isLoading ? (
        <p className="text-sm text-muted-foreground">{tc('loading')}</p>
      ) : (orders.data?.orders.length ?? 0) === 0 ? (
        <p className="rounded-[var(--radius)] border border-dashed border-border bg-card px-4 py-10 text-center text-sm text-muted-foreground">
          {tc('empty')}
        </p>
      ) : (
        <AdminTable>
          <thead className="border-b border-border bg-secondary/60 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">{t('orderNumber')}</th>
              <th className="px-3 py-2 font-medium">{t('customer')}</th>
              <th className="px-3 py-2 font-medium">{t('status')}</th>
              <th className="px-3 py-2 text-right font-medium">{t('total')}</th>
              <th className="px-3 py-2 font-medium">{t('rider')}</th>
              <th className="px-3 py-2 font-medium">{t('placedAt')}</th>
            </tr>
          </thead>
          <tbody>
            {orders.data?.orders.map((order) => (
              <tr key={order.id} className="border-b border-border last:border-0">
                <td className="px-3 py-2.5 font-mono text-xs">{order.orderNumber}</td>
                <td className="px-3 py-2.5">
                  <span className="block font-medium">{order.customerName}</span>
                  <span className="text-xs text-muted-foreground">
                    {order.customerPhone} · {order.pincode}
                  </span>
                </td>
                <td className="px-3 py-2.5">
                  <span
                    className={cn(
                      'rounded-full px-2 py-1 text-[11px] font-semibold',
                      STATUS_TONE[order.status] ?? 'bg-secondary',
                    )}
                  >
                    {tStatus(order.status)}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-right font-semibold tabular-nums">
                  {formatPaise(paise(order.totalPaise), { hidePaise: true })}
                </td>
                <td className="px-3 py-2.5 text-xs">
                  {order.riderName ?? (
                    <span className="text-warning">{t('filterUnassigned')}</span>
                  )}
                </td>
                <td className="px-3 py-2.5 text-xs text-muted-foreground">
                  {format.dateTime(new Date(order.placedAt), {
                    day: 'numeric',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </td>
              </tr>
            ))}
          </tbody>
        </AdminTable>
      )}
    </>
  );
}
