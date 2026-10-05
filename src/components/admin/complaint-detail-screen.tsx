'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import { AdminPageHeader } from '@/components/admin/admin-shell';
import { ApiClientError, api } from '@/lib/api/client';

interface ComplaintDetail {
  id: string;
  userName: string;
  userPhone: string;
  category: string;
  description: string;
  photoUrls: string[];
  status: 'OPEN' | 'RESOLVED';
  adminReply: string | null;
  createdAt: string;
}

export function ComplaintDetailScreen({ complaintId }: { complaintId: string }) {
  const t = useTranslations('admin.complaints');
  const tc = useTranslations('admin.common');
  const format = useFormatter();
  const queryClient = useQueryClient();

  const detail = useQuery({
    queryKey: ['admin-complaint', complaintId],
    queryFn: () => api.get<{ complaint: ComplaintDetail }>(`/api/admin/complaints/${complaintId}`),
  });

  const [reply, setReply] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = useMutation({
    mutationFn: () => api.patch(`/api/admin/complaints/${complaintId}`, { reply: reply.trim() }),
    onSuccess: () => {
      setError(null);
      setReply('');
      void queryClient.invalidateQueries({ queryKey: ['admin-complaint', complaintId] });
      void queryClient.invalidateQueries({ queryKey: ['admin-complaints'] });
    },
    onError: (err) => {
      if (err instanceof ApiClientError && err.code === 'FORBIDDEN') {
        setError(t('noPermission'));
        return;
      }
      setError(tc('failed'));
    },
  });

  if (detail.isLoading || !detail.data) {
    return (
      <>
        <AdminPageHeader title={t('title')} backHref="/admin/complaints" backLabel={tc('back')} />
        <p className="text-sm text-muted-foreground">{tc('loading')}</p>
      </>
    );
  }

  const { complaint } = detail.data;

  return (
    <>
      <AdminPageHeader
        title={complaint.userName}
        subtitle={complaint.userPhone}
        backHref="/admin/complaints"
        backLabel={tc('back')}
      />

      <section className="mb-4 rounded-[var(--radius-2xl)] border border-border bg-card p-4">
        <p className="text-xs font-semibold text-muted-foreground">
          {t(`category.${complaint.category}`)}
        </p>
        <p className="mt-1 text-sm">{complaint.description}</p>
        {complaint.photoUrls.length > 0 && (
          <div className="mt-2 flex gap-2">
            {complaint.photoUrls.map((url) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={url} src={url} alt="" className="size-20 rounded-[var(--radius)] object-cover" />
            ))}
          </div>
        )}
        <p className="mt-2 text-[11px] text-muted-foreground">
          {format.dateTime(new Date(complaint.createdAt), {
            day: 'numeric',
            month: 'short',
            hour: 'numeric',
            minute: 'numeric',
          })}
        </p>
      </section>

      {complaint.status === 'RESOLVED' ? (
        <section className="rounded-[var(--radius-2xl)] bg-tint-green p-4">
          <h2 className="mb-1 text-sm font-bold text-primary-dark">{t('yourReply')}</h2>
          <p className="text-sm text-primary-dark">{complaint.adminReply}</p>
        </section>
      ) : (
        <section className="rounded-[var(--radius-2xl)] border border-border bg-card p-4">
          <h2 className="mb-2 text-sm font-bold">{t('replyAndResolve')}</h2>
          <textarea
            rows={4}
            value={reply}
            onChange={(event) => setReply(event.target.value.slice(0, 1000))}
            placeholder={t('replyPlaceholder')}
            className="w-full resize-none rounded-[var(--radius)] border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
          />
          {error && <p className="mt-2 text-xs font-medium text-danger">{error}</p>}
          <button
            type="button"
            disabled={reply.trim().length < 5 || submit.isPending}
            onClick={() => {
              setError(null);
              submit.mutate();
            }}
            className="mt-3 flex h-10 items-center justify-center gap-1.5 rounded-[var(--radius)] bg-primary px-4 text-sm font-bold text-primary-foreground disabled:opacity-50"
          >
            {submit.isPending && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
            {t('sendReply')}
          </button>
        </section>
      )}
    </>
  );
}
