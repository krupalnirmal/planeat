'use client';

import { useQuery } from '@tanstack/react-query';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import {
  DateRangeDropdown,
  ExplorerPagination,
  ExplorerSplit,
  rangeToDateParams,
  type ExplorerRange,
} from '@/components/admin/explorer';
import { OrderDetailPanel } from '@/components/admin/order-detail-screen';
import { STATUS_TONE } from '@/components/admin/orders-screen';
import { api, qs } from '@/lib/api/client';
import { formatPaise, paise } from '@/lib/money';
import { cn } from '@/lib/utils';

/** Dashboard v2's Orders tab (session 2026-09-18, Part K) — the only tab
    with zero backend gap: `listAdminOrders` already supports search + a
    `placedAt` date range + real pagination (`page/perPage/total/hasMore`),
    and the right-hand detail panel is the exact same `OrderDetailPanel`
    that powers `/admin/orders/[id]` (`variant="inline"`), not a second
    copy.

    The list pane is one card (header + search/date row + table/cards +
    pagination footer, matching the reference's single "Orders (Today)"
    panel) rather than reusing `AdminResponsiveTable`/`AdminTable`, which
    each bring their own outer card meant for a full-bleed list screen —
    nesting those inside this embedded panel would double up the border. */

interface OrderRow {
  id: string;
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  type: string;
  status: string;
  totalPaise: string;
  itemCount: number;
  placedAt: string;
  pincode: string;
}

interface OrdersResponse {
  orders: OrderRow[];
  page: number;
  perPage: number;
  total: number;
}

const PER_PAGE = 10;

export function OrdersExplorerTab() {
  const t = useTranslations('admin.orders');
  const tc = useTranslations('admin.common');
  const tStatus = useTranslations('orders.status');
  const format = useFormatter();

  const [query, setQuery] = useState('');
  const [range, setRange] = useState<ExplorerRange>('today');
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const { dateFrom, dateTo } = rangeToDateParams(range);

  const orders = useQuery({
    queryKey: ['admin-dashboard-orders', query, range, page],
    queryFn: () =>
      api.get<OrdersResponse>(
        `/api/admin/orders${qs({
          query: query || undefined,
          dateFrom,
          dateTo,
          page,
          perPage: PER_PAGE,
        })}`,
      ),
    placeholderData: (previous) => previous,
  });

  const rows = orders.data?.orders ?? [];

  // Derived, not effect-driven: keeps the reference's "a row is already
  // open" feel without an extra click — falls back to the first row
  // whenever the explicit selection isn't in the current page (a new
  // search/range/page, or the row got filtered out), but leaves an
  // in-page selection alone otherwise.
  const effectiveSelectedId = rows.some((row) => row.id === selectedId)
    ? selectedId
    : (rows[0]?.id ?? null);

  function selectRow(id: string) {
    setSelectedId(id);
    setDetailOpen(true);
  }

  return (
    <ExplorerSplit
      detailOpen={detailOpen}
      onCloseDetail={() => setDetailOpen(false)}
      detail={effectiveSelectedId ? <OrderDetailPanel orderId={effectiveSelectedId} variant="inline" /> : null}
      list={
        <div className="card-3d rounded-[var(--radius)] border border-border/60 bg-card">
          <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
            <h2 className="text-sm font-bold">
              {t('title')} <span className="font-normal text-muted-foreground">({orders.data?.total ?? 0})</span>
            </h2>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <DateRangeDropdown
                value={range}
                onChange={(value) => {
                  setRange(value);
                  setPage(1);
                }}
              />
              <input
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setPage(1);
                }}
                placeholder={tc('search')}
                className="h-10 w-40 rounded-[var(--radius)] border border-border bg-secondary/40 px-3 text-sm outline-none sm:w-56"
              />
            </div>
          </div>

          {orders.isLoading ? (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">{tc('loading')}</p>
          ) : rows.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">{tc('empty')}</p>
          ) : (
            <>
              <div className="hidden overflow-x-auto lg:block">
                <table className="w-full min-w-[640px] text-sm">
                  <thead className="border-b border-border bg-secondary/60 text-left text-xs text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 font-medium">{t('orderNumber')}</th>
                      <th className="px-3 py-2 font-medium">{t('customer')}</th>
                      <th className="px-3 py-2 font-medium">{t('items')}</th>
                      <th className="px-3 py-2 text-right font-medium">{t('total')}</th>
                      <th className="px-3 py-2 font-medium">{t('status')}</th>
                      <th className="px-3 py-2 text-right font-medium">{t('placedAt')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((order) => (
                      <tr
                        key={order.id}
                        onClick={() => selectRow(order.id)}
                        className={cn(
                          'cursor-pointer border-b border-border last:border-0 hover:bg-secondary/40',
                          effectiveSelectedId === order.id && 'border-l-4 border-l-primary bg-tint-green/40',
                        )}
                      >
                        <td className="px-3 py-2.5 font-mono text-xs font-semibold text-primary">
                          #{order.orderNumber}
                        </td>
                        <td className="px-3 py-2.5 text-sm">{order.customerName}</td>
                        <td className="px-3 py-2.5 text-xs text-muted-foreground">
                          {order.itemCount} {t('items')}
                        </td>
                        <td className="px-3 py-2.5 text-right text-sm font-semibold tabular-nums">
                          {formatPaise(paise(order.totalPaise), { hidePaise: true })}
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
                        <td className="px-3 py-2.5 text-right text-xs text-muted-foreground">
                          {format.dateTime(new Date(order.placedAt), {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <ul className="flex flex-col gap-2.5 p-3 lg:hidden">
                {rows.map((order) => (
                  <li key={order.id}>
                    <button
                      type="button"
                      onClick={() => selectRow(order.id)}
                      className={cn(
                        'flex w-full flex-col gap-2 rounded-[var(--radius)] border border-border/60 bg-card p-3 text-left',
                        effectiveSelectedId === order.id && 'border-l-4 border-l-primary bg-tint-green/40',
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-xs font-semibold text-primary">
                          #{order.orderNumber}
                        </span>
                        <span
                          className={cn(
                            'shrink-0 rounded-full px-2 py-1 text-[11px] font-semibold',
                            STATUS_TONE[order.status] ?? 'bg-secondary',
                          )}
                        >
                          {tStatus(order.status)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-medium">{order.customerName}</p>
                        <p className="shrink-0 text-sm font-semibold tabular-nums">
                          {formatPaise(paise(order.totalPaise), { hidePaise: true })}
                        </p>
                      </div>
                      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                        <span>
                          {order.itemCount} {t('items')}
                        </span>
                        <span>
                          {format.dateTime(new Date(order.placedAt), { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>

              {orders.data && (
                <ExplorerPagination
                  page={orders.data.page}
                  perPage={orders.data.perPage}
                  total={orders.data.total}
                  onPageChange={setPage}
                />
              )}
            </>
          )}
        </div>
      }
    />
  );
}
