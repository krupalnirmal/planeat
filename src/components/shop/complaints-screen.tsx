'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { MessageSquareWarning, Package, Plus } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import { ComplaintForm } from '@/components/shop/complaint-form';
import { LoginPrompt } from '@/components/shop/login-prompt';
import { PageHeader } from '@/components/shop/page-header';
import { useSession } from '@/hooks/use-session';
import { api } from '@/lib/api/client';
import { cn } from '@/lib/utils';

/**
 * General complaint/feedback (session 2026-10-05) — not the order-scoped
 * issue-report flow embedded in `order-detail.tsx`. Same toggleable-form-
 * above-a-history-list shape as `src/components/vendor/dashboard.tsx`.
 */

type ComplaintStatus = 'OPEN' | 'RESOLVED';

interface ComplaintRow {
  id: string;
  category: string;
  description: string;
  status: ComplaintStatus;
  adminReply: string | null;
  createdAt: string;
}

export function ComplaintsScreen() {
  const t = useTranslations('complaints');
  const tc = useTranslations('common');
  const { isLoggedIn, isLoading: sessionLoading } = useSession();
  const queryClient = useQueryClient();

  const [showForm, setShowForm] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const complaints = useQuery({
    queryKey: ['my-complaints'],
    queryFn: () => api.get<{ complaints: ComplaintRow[] }>('/api/complaints'),
    enabled: isLoggedIn,
  });

  if (sessionLoading) {
    return (
      <>
        <PageHeader title={t('title')} backHref="/profile" backLabel={tc('back')} />
        <main className="pb-2 lg:mx-auto lg:max-w-2xl">
          <div className="bg-card px-4 py-8 text-sm text-muted-foreground">{tc('loading')}</div>
        </main>
      </>
    );
  }

  if (!isLoggedIn) {
    return (
      <>
        <PageHeader title={t('title')} backHref="/profile" backLabel={tc('back')} />
        <LoginPrompt
          icon={Package}
          title={t('title')}
          bandSubtitle={t('loginBandSubtitle')}
          description={t('loginDescription')}
          loginHref="/login?next=/complaints"
        />
      </>
    );
  }

  const rows = complaints.data?.complaints ?? [];

  return (
    <>
      <PageHeader title={t('title')} backHref="/profile" backLabel={tc('back')} />
      <main className="space-y-4 pb-4 lg:mx-auto lg:max-w-2xl">
        <div className="px-4 pt-4">
          {notice && (
            <p className="mb-3 rounded-[var(--radius)] bg-primary/5 px-3 py-2.5 text-sm">{notice}</p>
          )}

          {showForm ? (
            <ComplaintForm
              onDone={(message) => {
                setNotice(message);
                setShowForm(false);
                void queryClient.invalidateQueries({ queryKey: ['my-complaints'] });
              }}
              onCancel={() => setShowForm(false)}
            />
          ) : (
            <button
              type="button"
              onClick={() => {
                setShowForm(true);
                setNotice(null);
              }}
              className="flex h-11 w-full items-center justify-center gap-1.5 rounded-[var(--radius)] bg-primary text-sm font-bold text-primary-foreground"
            >
              <Plus className="size-4" aria-hidden />
              {t('newComplaint')}
            </button>
          )}
        </div>

        <section className="px-4">
          <h2 className="mb-2 text-sm font-bold">{t('history')}</h2>
          {complaints.isLoading ? (
            <p className="text-sm text-muted-foreground">{tc('loading')}</p>
          ) : rows.length === 0 ? (
            <p className="rounded-[var(--radius)] border border-dashed border-border bg-card px-4 py-10 text-center text-sm text-muted-foreground">
              {t('noneYet')}
            </p>
          ) : (
            <ul className="space-y-2">
              {rows.map((row) => (
                <ComplaintRowItem key={row.id} row={row} />
              ))}
            </ul>
          )}
        </section>
      </main>
    </>
  );
}

function ComplaintRowItem({ row }: { row: ComplaintRow }) {
  const t = useTranslations('complaints');
  const format = useFormatter();

  return (
    <li className="rounded-[var(--radius)] border border-border bg-card p-3">
      <div className="flex items-center gap-1.5">
        <span className="truncate text-sm font-semibold">{t(`category.${row.category}`)}</span>
        <StatusPill status={row.status} />
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{row.description}</p>
      <p className="mt-1 text-[11px] text-muted-foreground">
        {format.dateTime(new Date(row.createdAt), { day: 'numeric', month: 'short' })}
      </p>
      {row.adminReply && (
        <div className="mt-2 flex items-start gap-1.5 rounded-[var(--radius)] bg-tint-green p-2.5">
          <MessageSquareWarning className="mt-0.5 size-3.5 shrink-0 text-primary-dark" aria-hidden />
          <p className="text-xs text-primary-dark">{row.adminReply}</p>
        </div>
      )}
    </li>
  );
}

function StatusPill({ status }: { status: ComplaintStatus }) {
  const t = useTranslations('complaints.status');
  return (
    <span
      className={cn(
        'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold',
        status === 'OPEN' ? 'bg-[#FDF3E3] text-warning' : 'bg-tint-green text-primary-dark',
      )}
    >
      {t(status)}
    </span>
  );
}
