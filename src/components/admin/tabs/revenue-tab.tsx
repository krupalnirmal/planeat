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
import { api, qs } from '@/lib/api/client';
import { formatPaise, paise } from '@/lib/money';
import { cn } from '@/lib/utils';

/** Dashboard v2's Revenue tab (session 2026-09-19, Part O) — a "revenue
    entry" is just an order with `paymentStatus: PAID`, not a separate
    entity: `listAdminOrders` already covers everything this needs after
    the `paymentStatus` filter added alongside this tab. The detail panel
    reuses the exact same `OrderDetailPanel` the Orders tab uses (a revenue
    line IS an order) — no new detail UI. */

interface RevenueRow {
  id: string;
  orderNumber: string;
  customerName: string;
  totalPaise: string;
  paymentMethod: string;
  placedAt: string;
}

interface RevenueResponse {
  orders: RevenueRow[];
  page: number;
  perPage: number;
  total: number;
}

const PER_PAGE = 10;

export function RevenueExplorerTab() {
  const t = useTranslations('admin.orders');
  const te = useTranslations('admin.explorer');
  const tc = useTranslations('admin.common');
  const tPayment = useTranslations('orders.payment');
  const format = useFormatter();

  const [query, setQuery] = useState('');
  const [range, setRange] = useState<ExplorerRange>('30d');
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const { dateFrom, dateTo } = rangeToDateParams(range);

  const revenue = useQuery({
    queryKey: ['admin-dashboard-revenue', query, range, page],
    queryFn: () =>
      api.get<RevenueResponse>(
        `/api/admin/orders${qs({
          query: query || undefined,
          paymentStatus: 'PAID',
          dateFrom,
          dateTo,
          page,
          perPage: PER_PAGE,
        })}`,
      ),
    placeholderData: (previous) => previous,
  });

  const rows = revenue.data?.orders ?? [];
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
        <div className="card-3d overflow-hidden rounded-[var(--radius)] border border-border/60 bg-card">
          <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
            <h2 className="text-sm font-bold">
              {te('tabs.revenue')} <span className="font-normal text-muted-foreground">({revenue.data?.total ?? 0})</span>
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

          {revenue.isLoading ? (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">{tc('loading')}</p>
          ) : rows.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">{tc('empty')}</p>
          ) : (
            <>
              <div className="hidden overflow-x-auto lg:block">
                <table className="w-full min-w-[560px] text-sm">
                  <thead className="border-b border-border bg-secondary/60 text-left text-xs text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 font-medium">{t('orderNumber')}</th>
                      <th className="px-3 py-2 font-medium">{t('customer')}</th>
                      <th className="px-3 py-2 text-right font-medium">{t('total')}</th>
                      <th className="px-3 py-2 font-medium">{t('paymentMethod')}</th>
                      <th className="px-3 py-2 text-right font-medium">{t('placedAt')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr
                        key={row.id}
                        onClick={() => selectRow(row.id)}
                        className={cn(
                          'cursor-pointer border-b border-border last:border-0 hover:bg-secondary/40',
                          effectiveSelectedId === row.id && 'border-l-4 border-l-primary bg-tint-green/40',
                        )}
                      >
                        <td className="px-3 py-2.5 font-mono text-xs font-semibold text-primary">
                          #{row.orderNumber}
                        </td>
                        <td className="px-3 py-2.5 text-sm">{row.customerName}</td>
                        <td className="px-3 py-2.5 text-right text-sm font-semibold text-success tabular-nums">
                          + {formatPaise(paise(row.totalPaise), { hidePaise: true })}
                        </td>
                        <td className="px-3 py-2.5 text-xs text-muted-foreground">{tPayment(row.paymentMethod)}</td>
                        <td className="px-3 py-2.5 text-right text-xs text-muted-foreground">
                          {format.dateTime(new Date(row.placedAt), { day: 'numeric', month: 'short' })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <ul className="flex flex-col gap-2.5 p-3 lg:hidden">
                {rows.map((row) => (
                  <li key={row.id}>
                    <button
                      type="button"
                      onClick={() => selectRow(row.id)}
                      className={cn(
                        'flex w-full items-center justify-between gap-2 rounded-[var(--radius)] border border-border/60 bg-card p-3 text-left',
                        effectiveSelectedId === row.id && 'border-l-4 border-l-primary bg-tint-green/40',
                      )}
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{row.customerName}</p>
                        <p className="font-mono text-xs text-muted-foreground">#{row.orderNumber}</p>
                      </div>
                      <p className="shrink-0 text-sm font-semibold text-success tabular-nums">
                        + {formatPaise(paise(row.totalPaise), { hidePaise: true })}
                      </p>
                    </button>
                  </li>
                ))}
              </ul>

              {revenue.data && (
                <ExplorerPagination
                  page={revenue.data.page}
                  perPage={revenue.data.perPage}
                  total={revenue.data.total}
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
