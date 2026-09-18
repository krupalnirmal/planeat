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
import { cn } from '@/lib/utils';

/** Dashboard v2's Deliveries tab (session 2026-09-19, Part P) — new
    `listDeliveryOrders()` (orders joined with their real `DeliveryAssignment`
    + `DeliveryPartner`), reusing the real `delivery.status` labels the
    rider app already has rather than inventing new ones. No ETA anywhere
    — confirmed nothing like it exists in the schema. Detail panel reuses
    `OrderDetailPanel`, which now also shows the three real assignment
    timestamps in its Rider section. */

interface DeliveryRow {
  id: string;
  orderNumber: string;
  customerName: string;
  pincode: string;
  riderName: string;
  assignmentStatus: 'ASSIGNED' | 'PICKED_UP' | 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'FAILED';
  assignedAt: string;
  deliveredAt: string | null;
}

interface DeliveriesResponse {
  orders: DeliveryRow[];
  page: number;
  perPage: number;
  total: number;
}

const STATUS_OPTIONS = ['ASSIGNED', 'PICKED_UP', 'OUT_FOR_DELIVERY', 'DELIVERED', 'FAILED'] as const;

const STATUS_TONE: Record<string, string> = {
  ASSIGNED: 'bg-secondary text-muted-foreground',
  PICKED_UP: 'bg-primary/10 text-primary',
  OUT_FOR_DELIVERY: 'bg-accent/20 text-[#8A5A2B]',
  DELIVERED: 'bg-primary/10 text-success',
  FAILED: 'bg-danger/10 text-danger',
};

const PER_PAGE = 10;

export function DeliveriesExplorerTab() {
  const t = useTranslations('admin.orders');
  const te = useTranslations('admin.explorer');
  const tc = useTranslations('admin.common');
  const tStatus = useTranslations('delivery.status');
  const format = useFormatter();

  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [range, setRange] = useState<ExplorerRange>('7d');
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const { dateFrom, dateTo } = rangeToDateParams(range);

  const deliveries = useQuery({
    queryKey: ['admin-dashboard-deliveries', query, status, range, page],
    queryFn: () =>
      api.get<DeliveriesResponse>(
        `/api/admin/deliveries${qs({
          query: query || undefined,
          assignmentStatus: status || undefined,
          dateFrom,
          dateTo,
          page,
          perPage: PER_PAGE,
        })}`,
      ),
    placeholderData: (previous) => previous,
  });

  const rows = deliveries.data?.orders ?? [];
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
              {te('tabs.deliveries')} <span className="font-normal text-muted-foreground">({deliveries.data?.total ?? 0})</span>
            </h2>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <select
                value={status}
                onChange={(event) => {
                  setStatus(event.target.value);
                  setPage(1);
                }}
                className="h-10 rounded-[var(--radius)] border border-border bg-card px-2 text-xs outline-none"
              >
                <option value="">{tc('actions')}</option>
                {STATUS_OPTIONS.map((value) => (
                  <option key={value} value={value}>
                    {tStatus(value)}
                  </option>
                ))}
              </select>
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

          {deliveries.isLoading ? (
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
                      <th className="px-3 py-2 font-medium">{t('rider')}</th>
                      <th className="px-3 py-2 font-medium">{t('status')}</th>
                      <th className="px-3 py-2 text-right font-medium">{t('assignedAt')}</th>
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
                        <td className="px-3 py-2.5 text-xs text-muted-foreground">{row.riderName}</td>
                        <td className="px-3 py-2.5">
                          <span
                            className={cn(
                              'rounded-full px-2 py-1 text-[11px] font-semibold',
                              STATUS_TONE[row.assignmentStatus] ?? 'bg-secondary',
                            )}
                          >
                            {tStatus(row.assignmentStatus)}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-right text-xs text-muted-foreground">
                          {format.dateTime(new Date(row.assignedAt), { day: 'numeric', month: 'short' })}
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
                        'flex w-full flex-col gap-2 rounded-[var(--radius)] border border-border/60 bg-card p-3 text-left',
                        effectiveSelectedId === row.id && 'border-l-4 border-l-primary bg-tint-green/40',
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-xs font-semibold text-primary">#{row.orderNumber}</span>
                        <span
                          className={cn(
                            'shrink-0 rounded-full px-2 py-1 text-[11px] font-semibold',
                            STATUS_TONE[row.assignmentStatus] ?? 'bg-secondary',
                          )}
                        >
                          {tStatus(row.assignmentStatus)}
                        </span>
                      </div>
                      <p className="truncate text-sm font-medium">{row.customerName}</p>
                      <p className="text-xs text-muted-foreground">{row.riderName}</p>
                    </button>
                  </li>
                ))}
              </ul>

              {deliveries.data && (
                <ExplorerPagination
                  page={deliveries.data.page}
                  perPage={deliveries.data.perPage}
                  total={deliveries.data.total}
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
