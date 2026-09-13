'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bike, Loader2 } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import { AdminPageHeader, AdminTable } from '@/components/admin/admin-shell';
import { Link } from '@/i18n/navigation';
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

interface Partner {
  id: string;
  name: string;
  isAvailable: boolean;
  todayLoad: number;
}

export const STATUS_TONE: Record<string, string> = {
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

const STATUS_OPTIONS = [
  'PLACED',
  'CONFIRMED',
  'PACKED',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'CANCELLED',
  'FAILED_DELIVERY',
  'REFUNDED',
  'PAYMENT_PENDING',
] as const;

const TYPE_OPTIONS = ['INSTANT', 'MEAL_PLAN_DAILY'] as const;

export function AdminOrdersScreen() {
  const t = useTranslations('admin.orders');
  const tc = useTranslations('admin.common');
  const tStatus = useTranslations('orders.status');
  const tType = useTranslations('admin.orders.typeLabel');
  const format = useFormatter();
  const queryClient = useQueryClient();

  const [unassignedOnly, setUnassignedOnly] = useState(false);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [type, setType] = useState('');
  const [dateKey, setDateKey] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const orders = useQuery({
    queryKey: ['admin-orders', unassignedOnly, query, status, type, dateKey],
    queryFn: () =>
      api.get<{ orders: OrderRow[] }>(
        `/api/admin/orders${qs({
          unassignedOnly: unassignedOnly ? 'true' : undefined,
          query: query || undefined,
          status: status || undefined,
          type: type || undefined,
          date: dateKey || undefined,
          perPage: 50,
        })}`,
      ),
    // A new order should show up without a manual refresh — matches the
    // Dashboard's own polling (dashboard-screen.tsx), tighter than its 60s
    // since this list is where the admin actually acts on a new order.
    refetchInterval: 30_000,
  });

  const suggestions = useQuery({
    queryKey: ['admin-rider-suggestions'],
    queryFn: () => api.get<{ suggestions: Suggestion[] }>('/api/admin/riders/suggest'),
    enabled: showSuggestions,
  });

  // For the per-zone override below: the suggestion panel only ever proposes
  // ONE partner per order (B12), so overriding an entire pincode's worth of
  // orders onto a different rider (someone is on leave, a cluster is out of
  // the suggested rider's way today) needs the full roster, not just whoever
  // the algorithm picked.
  const partners = useQuery({
    queryKey: ['admin-delivery-partners-list'],
    queryFn: () => api.get<{ partners: Partner[] }>('/api/admin/delivery-partners'),
    enabled: showSuggestions,
  });

  const [zonePartner, setZonePartner] = useState<Record<string, string>>({});

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

  // Grouped so the owner can hand a whole cluster to one rider in a tap —
  // "all of 422001 goes to Ramesh today" — instead of confirming the
  // algorithm's per-order pick one at a time.
  const byPincode = new Map<string, Suggestion[]>();
  for (const suggestion of assignable) {
    const group = byPincode.get(suggestion.pincode) ?? [];
    group.push(suggestion);
    byPincode.set(suggestion.pincode, group);
  }

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
              {/* Per-pincode override: the owner's own choice of rider for a
                  whole cluster, instead of confirming the algorithm's pick
                  order by order. */}
              <ul className="mb-4 space-y-3">
                {[...byPincode.entries()].map(([pincode, group]) => {
                  const selected = zonePartner[pincode] ?? group[0].suggestedPartnerId;
                  return (
                    <li key={pincode} className="rounded-[var(--radius)] border border-border p-3">
                      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                        <span className="text-sm font-bold">
                          {pincode} · {t('zoneOrderCount', { count: group.length })}
                        </span>
                        <div className="flex items-center gap-2">
                          <select
                            value={selected}
                            onChange={(event) =>
                              setZonePartner((prev) => ({ ...prev, [pincode]: event.target.value }))
                            }
                            className="h-9 rounded-[var(--radius)] border border-border bg-background px-2 text-xs"
                          >
                            {(partners.data?.partners ?? []).map((partner) => (
                              <option key={partner.id} value={partner.id}>
                                {partner.name}
                                {!partner.isAvailable ? ` (${tc('unavailable')})` : ''} ·{' '}
                                {t('zoneLoad', { count: partner.todayLoad })}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() =>
                              assignAll.mutate(
                                group.map((suggestion) => ({
                                  orderId: suggestion.orderId,
                                  partnerId: selected,
                                })),
                              )
                            }
                            disabled={assignAll.isPending}
                            className="flex h-9 items-center gap-1.5 rounded-[var(--radius)] bg-primary px-3 text-xs font-bold text-primary-foreground disabled:opacity-50"
                          >
                            {t('zoneAssign')}
                          </button>
                        </div>
                      </div>
                      <ul className="space-y-1">
                        {group.map((suggestion) => (
                          <li
                            key={suggestion.orderId}
                            className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground"
                          >
                            <span className="font-mono">{suggestion.orderNumber}</span>
                            <span>{suggestion.suggestedPartnerName}</span>
                          </li>
                        ))}
                      </ul>
                    </li>
                  );
                })}
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
        <select
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          aria-label={t('filterStatus')}
          className="h-10 rounded-[var(--radius)] border border-border bg-card px-2 text-xs outline-none"
        >
          <option value="">{t('filterStatus')}</option>
          {STATUS_OPTIONS.map((value) => (
            <option key={value} value={value}>
              {tStatus(value)}
            </option>
          ))}
        </select>
        <select
          value={type}
          onChange={(event) => setType(event.target.value)}
          aria-label={t('filterType')}
          className="h-10 rounded-[var(--radius)] border border-border bg-card px-2 text-xs outline-none"
        >
          <option value="">{t('filterType')}</option>
          {TYPE_OPTIONS.map((value) => (
            <option key={value} value={value}>
              {tType(value)}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={dateKey}
          onChange={(event) => setDateKey(event.target.value)}
          aria-label={t('filterDate')}
          className="h-10 rounded-[var(--radius)] border border-border bg-card px-2 text-xs outline-none"
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
              <tr key={order.id} className="border-b border-border last:border-0 hover:bg-secondary/40">
                <td className="px-3 py-2.5 font-mono text-xs">
                  <Link href={`/admin/orders/${order.id}`} className="text-primary hover:underline">
                    {order.orderNumber}
                  </Link>
                </td>
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
