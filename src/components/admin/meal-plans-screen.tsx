'use client';

import { useQuery } from '@tanstack/react-query';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import { AdminPageHeader, AdminResponsiveTable } from '@/components/admin/admin-shell';
import { Link } from '@/i18n/navigation';
import { api, qs } from '@/lib/api/client';
import { cn } from '@/lib/utils';

/**
 * The "My Meal Plan" admin module (session 2026-09-18) — a cross-customer
 * list of every subscription, filterable by status. Every subscription's
 * own day-by-day picks, wallet balance, and rider-assignment control
 * already live on the customer detail page (`customer-detail-screen.tsx`,
 * `CustomerPlanView`) — this list is the missing "who has one at all, and
 * who needs attention" overview that only existed one customer at a time
 * before, not a duplicate of that detail.
 */

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

/** Exported for the dashboard v2 Plans tab (Part M), which reuses the same
    tone/option lists rather than redefining them. */
export const STATUS_TONE: Record<string, string> = {
  ACTIVE: 'bg-primary/10 text-success',
  PAUSED: 'bg-[#FDF3E3] text-warning',
  CANCELLED: 'bg-danger/10 text-danger',
  COMPLETED: 'bg-secondary text-muted-foreground',
};

export const STATUS_OPTIONS = ['ACTIVE', 'PAUSED', 'CANCELLED', 'COMPLETED'] as const;

export function AdminMealPlansScreen() {
  const t = useTranslations('admin.mealPlans');
  const tc = useTranslations('admin.common');
  const tStatus = useTranslations('admin.mealPlans.status');
  const format = useFormatter();

  const [status, setStatus] = useState('');
  const [query, setQuery] = useState('');

  const subscriptions = useQuery({
    queryKey: ['admin-subscriptions', status, query],
    queryFn: () =>
      api.get<{ subscriptions: SubscriptionRow[] }>(
        `/api/admin/subscriptions${qs({ status: status || undefined, query: query || undefined, perPage: 50 })}`,
      ),
  });

  const rows = subscriptions.data?.subscriptions ?? [];

  return (
    <>
      <AdminPageHeader title={t('title')} subtitle={t('hint')} />

      <div className="mb-3 flex flex-wrap gap-2">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={tc('search')}
          className="h-10 min-w-48 flex-1 rounded-[var(--radius)] border border-border bg-card px-3 text-sm outline-none"
        />
        <button
          type="button"
          onClick={() => setStatus('')}
          className={cn(
            'h-10 rounded-[var(--radius)] px-3 text-xs font-medium',
            status === '' ? 'bg-primary text-primary-foreground font-semibold' : 'border border-border bg-card text-muted-foreground',
          )}
        >
          {tc('actions')}
        </button>
        {STATUS_OPTIONS.map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setStatus(value)}
            className={cn(
              'h-10 rounded-[var(--radius)] px-3 text-xs font-medium',
              status === value ? 'bg-primary text-primary-foreground font-semibold' : 'border border-border bg-card text-muted-foreground',
            )}
          >
            {tStatus(value)}
          </button>
        ))}
      </div>

      {subscriptions.isLoading ? (
        <p className="text-sm text-muted-foreground">{tc('loading')}</p>
      ) : rows.length === 0 ? (
        <p className="rounded-[var(--radius)] border border-dashed border-border bg-card px-4 py-10 text-center text-sm text-muted-foreground">
          {tc('empty')}
        </p>
      ) : (
        <AdminResponsiveTable
          table={
            <>
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
                  <tr key={sub.id} className="border-b border-border last:border-0 hover:bg-secondary/40">
                    <td className="px-3 py-2.5">
                      <Link href={`/admin/customers/${sub.customerId}`} className="block font-medium text-primary hover:underline">
                        {sub.customerName}
                      </Link>
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
                    <td
                      className={cn(
                        'px-3 py-2.5 text-right font-semibold tabular-nums',
                        sub.status === 'ACTIVE' && sub.daysRemaining <= 2 ? 'text-warning' : '',
                      )}
                    >
                      {sub.status === 'ACTIVE' || sub.status === 'PAUSED' ? sub.daysRemaining : '—'}
                    </td>
                    <td className="px-3 py-2.5 text-xs">
                      {sub.assignedPartnerName ?? <span className="text-muted-foreground">{t('noRider')}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </>
          }
          cards={rows.map((sub) => (
            <li key={sub.id}>
              <Link
                href={`/admin/customers/${sub.customerId}`}
                className="card-3d flex flex-col gap-2 rounded-[var(--radius)] border border-border/60 bg-card p-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{sub.customerName}</p>
                    <p className="text-xs text-muted-foreground">{sub.customerPhone}</p>
                  </div>
                  <span className={cn('shrink-0 rounded-full px-2 py-1 text-[11px] font-semibold', STATUS_TONE[sub.status])}>
                    {tStatus(sub.status)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span>
                    {format.dateTime(new Date(sub.startDate), { day: 'numeric', month: 'short' })} –{' '}
                    {format.dateTime(new Date(sub.endDate), { day: 'numeric', month: 'short' })}
                  </span>
                  <span>{sub.assignedPartnerName ?? t('noRider')}</span>
                </div>
                {(sub.status === 'ACTIVE' || sub.status === 'PAUSED') && (
                  <p
                    className={cn(
                      'text-xs font-semibold',
                      sub.status === 'ACTIVE' && sub.daysRemaining <= 2 ? 'text-warning' : 'text-muted-foreground',
                    )}
                  >
                    {t('daysLeft')}: {sub.daysRemaining}
                  </p>
                )}
              </Link>
            </li>
          ))}
        />
      )}
    </>
  );
}
