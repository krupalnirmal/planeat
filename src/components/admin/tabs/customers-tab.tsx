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
import { CustomerDetailScreen } from '@/components/admin/customer-detail-screen';
import { api, qs } from '@/lib/api/client';
import { cn } from '@/lib/utils';

/** Dashboard v2's Customers tab (session 2026-09-18, Part L) — same
    structure as the Orders tab: `searchCustomers` already covers name/
    phone search + real pagination; a `createdAt` range filter was added
    alongside this tab. The detail panel reuses `CustomerDetailScreen`
    (`variant="inline"`) — the exact component behind `/admin/customers/
    [id]`, not a second copy. */

interface CustomerRow {
  id: string;
  name: string | null;
  phone: string;
  orderCount: number;
  hasMealPlan: boolean;
  createdAt: string;
}

interface CustomersResponse {
  customers: CustomerRow[];
  page: number;
  perPage: number;
  total: number;
}

const PER_PAGE = 10;

export function CustomersExplorerTab() {
  const t = useTranslations('admin.customers');
  const tc = useTranslations('admin.common');
  const format = useFormatter();

  const [query, setQuery] = useState('');
  const [range, setRange] = useState<ExplorerRange>('30d');
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const { dateFrom, dateTo } = rangeToDateParams(range);

  const customers = useQuery({
    queryKey: ['admin-dashboard-customers', query, range, page],
    queryFn: () =>
      api.get<CustomersResponse>(
        `/api/admin/customers${qs({
          query: query || undefined,
          dateFrom,
          dateTo,
          page,
          perPage: PER_PAGE,
        })}`,
      ),
    placeholderData: (previous) => previous,
  });

  const rows = customers.data?.customers ?? [];
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
      detail={
        effectiveSelectedId ? <CustomerDetailScreen customerId={effectiveSelectedId} variant="inline" /> : null
      }
      list={
        <div className="card-3d overflow-hidden rounded-[var(--radius)] border border-border/60 bg-card">
          <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
            <h2 className="text-sm font-bold">
              {t('title')} <span className="font-normal text-muted-foreground">({customers.data?.total ?? 0})</span>
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
                placeholder={t('search')}
                className="h-10 w-40 rounded-[var(--radius)] border border-border bg-secondary/40 px-3 text-sm outline-none sm:w-56"
              />
            </div>
          </div>

          {customers.isLoading ? (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">{tc('loading')}</p>
          ) : rows.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">{tc('empty')}</p>
          ) : (
            <>
              <div className="hidden overflow-x-auto lg:block">
                <table className="w-full min-w-[560px] text-sm">
                  <thead className="border-b border-border bg-secondary/60 text-left text-xs text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 font-medium">{t('name')}</th>
                      <th className="px-3 py-2 font-medium">{t('phone')}</th>
                      <th className="px-3 py-2 text-right font-medium">{t('orders')}</th>
                      <th className="px-3 py-2 font-medium">{t('hasPlan')}</th>
                      <th className="px-3 py-2 text-right font-medium">{t('joined')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((customer) => (
                      <tr
                        key={customer.id}
                        onClick={() => selectRow(customer.id)}
                        className={cn(
                          'cursor-pointer border-b border-border last:border-0 hover:bg-secondary/40',
                          effectiveSelectedId === customer.id && 'border-l-4 border-l-primary bg-tint-green/40',
                        )}
                      >
                        <td className="px-3 py-2.5 text-sm font-medium">{customer.name ?? '—'}</td>
                        <td className="px-3 py-2.5 font-mono text-xs">{customer.phone}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{customer.orderCount}</td>
                        <td className="px-3 py-2.5 text-xs">{customer.hasMealPlan ? '✓' : '—'}</td>
                        <td className="px-3 py-2.5 text-right text-xs text-muted-foreground">
                          {format.dateTime(new Date(customer.createdAt), { day: 'numeric', month: 'short' })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <ul className="flex flex-col gap-2.5 p-3 lg:hidden">
                {rows.map((customer) => (
                  <li key={customer.id}>
                    <button
                      type="button"
                      onClick={() => selectRow(customer.id)}
                      className={cn(
                        'flex w-full items-center justify-between gap-2 rounded-[var(--radius)] border border-border/60 bg-card p-3 text-left',
                        effectiveSelectedId === customer.id && 'border-l-4 border-l-primary bg-tint-green/40',
                      )}
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{customer.name ?? '—'}</p>
                        <p className="font-mono text-xs text-muted-foreground">{customer.phone}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-sm font-bold tabular-nums">{customer.orderCount}</p>
                        <p className="text-[11px] text-muted-foreground">{t('orders')}</p>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>

              {customers.data && (
                <ExplorerPagination
                  page={customers.data.page}
                  perPage={customers.data.perPage}
                  total={customers.data.total}
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
