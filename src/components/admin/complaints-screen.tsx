'use client';

import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { AdminPageHeader, AdminResponsiveTable } from '@/components/admin/admin-shell';
import { Link } from '@/i18n/navigation';
import { api } from '@/lib/api/client';
import { cn } from '@/lib/utils';

interface ComplaintRow {
  id: string;
  userName: string;
  userPhone: string;
  category: string;
  description: string;
  status: 'OPEN' | 'RESOLVED';
  createdAt: string;
}

const FILTERS = ['OPEN', 'RESOLVED', undefined] as const;

export function AdminComplaintsScreen() {
  const t = useTranslations('admin.complaints');
  const tc = useTranslations('admin.common');
  const [status, setStatus] = useState<'OPEN' | 'RESOLVED' | undefined>('OPEN');

  const complaints = useQuery({
    queryKey: ['admin-complaints', status],
    queryFn: () =>
      api.get<{ complaints: ComplaintRow[] }>(
        `/api/admin/complaints${status ? `?status=${status}` : ''}`,
      ),
  });

  const rows = complaints.data?.complaints ?? [];

  return (
    <>
      <AdminPageHeader
        title={t('title')}
        subtitle={t('hint')}
        action={
          <div className="flex gap-1.5">
            {FILTERS.map((value) => (
              <button
                key={value ?? 'all'}
                type="button"
                onClick={() => setStatus(value)}
                aria-pressed={status === value}
                className={cn(
                  'h-9 rounded-[var(--radius)] border px-3 text-xs font-semibold',
                  status === value ? 'border-primary bg-primary text-primary-foreground' : 'border-border',
                )}
              >
                {value ? t(`filter.${value}`) : t('filter.ALL')}
              </button>
            ))}
          </div>
        }
      />

      {complaints.isLoading ? (
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
                  <th className="px-3 py-2 font-medium">{t('categoryColumn')}</th>
                  <th className="px-3 py-2 font-medium">{t('description')}</th>
                  <th className="px-3 py-2 text-center font-medium">{t('status')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id} className="border-b border-border last:border-0 hover:bg-secondary/40">
                    <td className="px-3 py-2 font-medium">
                      <Link href={`/admin/complaints/${c.id}`} className="text-primary hover:underline">
                        {c.userName}
                      </Link>
                      <br />
                      <span className="font-mono text-xs text-muted-foreground">{c.userPhone}</span>
                    </td>
                    <td className="px-3 py-2 text-xs">{t(`category.${c.category}`)}</td>
                    <td className="max-w-xs truncate px-3 py-2 text-xs text-muted-foreground">
                      {c.description}
                    </td>
                    <td className="px-3 py-2 text-center text-xs">
                      {c.status === 'OPEN' ? t('open') : t('resolved')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </>
          }
          cards={rows.map((c) => (
            <li key={c.id}>
              <Link
                href={`/admin/complaints/${c.id}`}
                className="card-3d flex items-center justify-between gap-2 rounded-[var(--radius)] border border-border/60 bg-card p-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{c.userName}</p>
                  <p className="truncate text-xs text-muted-foreground">{c.description}</p>
                </div>
                <span
                  className={cn(
                    'shrink-0 rounded-full px-2.5 py-1 text-xs font-bold',
                    c.status === 'OPEN' ? 'bg-warning/15 text-warning' : 'bg-tint-green text-primary-dark',
                  )}
                >
                  {c.status === 'OPEN' ? t('open') : t('resolved')}
                </span>
              </Link>
            </li>
          ))}
        />
      )}
    </>
  );
}
