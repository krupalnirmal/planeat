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
import { STATUS_OPTIONS, STATUS_TONE } from '@/components/admin/meal-plans-screen';
import { SubscriptionDetailPanel } from '@/components/admin/subscription-detail-panel';
import { api, qs } from '@/lib/api/client';
import { cn } from '@/lib/utils';

/** Dashboard v2's Plans tab (session 2026-09-18, Part M) — `listSubscriptions`
    already covers status/name/phone filters; a `startDate` range filter was
    added alongside this tab. The detail panel (`SubscriptionDetailPanel`) is
    new — before this, a subscription row only ever linked out to the whole
    customer page. */

interface SubscriptionRow {
  id: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  status: 'ACTIVE' | 'PAUSED' | 'CANCELLED' | 'COMPLETED';
  startDate: string;
  endDate: string;
  daysRemaining: number;
  assignedPartnerName: string | null;
}

interface SubscriptionsResponse {
  subscriptions: SubscriptionRow[];
  page: number;
  perPage: number;
  total: number;
}

const PER_PAGE = 10;

export function PlansExplorerTab() {
  const t = useTranslations('admin.mealPlans');
  const tc = useTranslations('admin.common');
  const tStatus = useTranslations('admin.mealPlans.status');
  const format = useFormatter();

  const [status, setStatus] = useState('');
  const [query, setQuery] = useState('');
  const [range, setRange] = useState<ExplorerRange>('30d');
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const { dateFrom, dateTo } = rangeToDateParams(range);

  const subscriptions = useQuery({
    queryKey: ['admin-dashboard-plans', status, query, range, page],
    queryFn: () =>
      api.get<SubscriptionsResponse>(
        `/api/admin/subscriptions${qs({
          status: status || undefined,
          query: query || undefined,
          dateFrom,
          dateTo,
          page,
          perPage: PER_PAGE,
        })}`,
      ),
    placeholderData: (previous) => previous,
  });

  const rows = subscriptions.data?.subscriptions ?? [];
  const effectiveSelectedId = rows.some((row) => row.id === selectedId)
    ? selectedId
    : (rows[0]?.id ?? null);
  const selectedRow = rows.find((row) => row.id === effectiveSelectedId) ?? null;

  function selectRow(id: string) {
    setSelectedId(id);
    setDetailOpen(true);
  }

  return (
    <ExplorerSplit
      detailOpen={detailOpen}
      onCloseDetail={() => setDetailOpen(false)}
      detail={
        selectedRow ? (
          <SubscriptionDetailPanel subscriptionId={selectedRow.id} customerId={selectedRow.customerId} />
        ) : null
      }
      list={
        <div className="card-3d rounded-[var(--radius)] border border-border/60 bg-card">
          <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
            <h2 className="text-sm font-bold">
              {t('title')} <span className="font-normal text-muted-foreground">({subscriptions.data?.total ?? 0})</span>
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

          {subscriptions.isLoading ? (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">{tc('loading')}</p>
          ) : rows.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">{tc('empty')}</p>
          ) : (
            <>
              <div className="hidden overflow-x-auto lg:block">
                <table className="w-full min-w-[560px] text-sm">
                  <thead className="border-b border-border bg-secondary/60 text-left text-xs text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 font-medium">{t('customer')}</th>
                      <th className="px-3 py-2 font-medium">{t('statusLabel')}</th>
                      <th className="px-3 py-2 font-medium">{t('period')}</th>
                      <th className="px-3 py-2 text-right font-medium">{t('daysLeft')}</th>
                      <th className="px-3 py-2 font-medium">{t('rider')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((sub) => (
                      <tr
                        key={sub.id}
                        onClick={() => selectRow(sub.id)}
                        className={cn(
                          'cursor-pointer border-b border-border last:border-0 hover:bg-secondary/40',
                          effectiveSelectedId === sub.id && 'border-l-4 border-l-primary bg-tint-green/40',
                        )}
                      >
                        <td className="px-3 py-2.5">
                          <span className="block text-sm font-medium">{sub.customerName}</span>
                          <span className="text-xs text-muted-foreground">{sub.customerPhone}</span>
                        </td>
                        <td className="px-3 py-2.5">
                          <span className={cn('rounded-full px-2 py-1 text-[11px] font-semibold', STATUS_TONE[sub.status])}>
                            {tStatus(sub.status)}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-xs text-muted-foreground">
                          {format.dateTime(new Date(sub.startDate), { day: 'numeric', month: 'short' })} –{' '}
                          {format.dateTime(new Date(sub.endDate), { day: 'numeric', month: 'short' })}
                        </td>
                        <td className="px-3 py-2.5 text-right font-semibold tabular-nums">
                          {sub.status === 'ACTIVE' || sub.status === 'PAUSED' ? sub.daysRemaining : '—'}
                        </td>
                        <td className="px-3 py-2.5 text-xs">
                          {sub.assignedPartnerName ?? <span className="text-muted-foreground">{t('noRider')}</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <ul className="flex flex-col gap-2.5 p-3 lg:hidden">
                {rows.map((sub) => (
                  <li key={sub.id}>
                    <button
                      type="button"
                      onClick={() => selectRow(sub.id)}
                      className={cn(
                        'flex w-full flex-col gap-2 rounded-[var(--radius)] border border-border/60 bg-card p-3 text-left',
                        effectiveSelectedId === sub.id && 'border-l-4 border-l-primary bg-tint-green/40',
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-medium">{sub.customerName}</p>
                        <span className={cn('shrink-0 rounded-full px-2 py-1 text-[11px] font-semibold', STATUS_TONE[sub.status])}>
                          {tStatus(sub.status)}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {format.dateTime(new Date(sub.startDate), { day: 'numeric', month: 'short' })} –{' '}
                        {format.dateTime(new Date(sub.endDate), { day: 'numeric', month: 'short' })}
                      </p>
                    </button>
                  </li>
                ))}
              </ul>

              {subscriptions.data && (
                <ExplorerPagination
                  page={subscriptions.data.page}
                  perPage={subscriptions.data.perPage}
                  total={subscriptions.data.total}
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
