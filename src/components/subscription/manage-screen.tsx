'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarRange, ChevronLeft, MapPin, PauseCircle, PlayCircle, XCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Link } from '@/i18n/navigation';
import { useSession } from '@/hooks/use-session';
import { ApiClientError, api } from '@/lib/api/client';
import { formatPaise, paise } from '@/lib/money';
import { cn } from '@/lib/utils';

/** M6 — pause a range, resume, cancel, and change address for future days. */

interface SubscriptionResponse {
  subscription: {
    id: string;
    status: 'ACTIVE' | 'PAUSED' | 'CANCELLED' | 'COMPLETED';
    startDate: string;
    endDate: string;
    daysUntilEnd: number;
    address: { id: string; label: string; line1: string; city: string; pincode: string };
  } | null;
}

export function SubscriptionManageScreen() {
  const t = useTranslations('subscription');
  const tc = useTranslations('common');
  const te = useTranslations('errors');
  const queryClient = useQueryClient();
  const { user } = useSession();

  const [pauseFrom, setPauseFrom] = useState('');
  const [pauseTo, setPauseTo] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const current = useQuery({
    queryKey: ['subscription-current'],
    queryFn: () => api.get<SubscriptionResponse>('/api/subscriptions/current'),
  });

  const subscription = current.data?.subscription ?? null;

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ['subscription-current'] });
  }

  function handleError(err: unknown) {
    setError(err instanceof ApiClientError ? err.message : te('generic'));
  }

  const pause = useMutation({
    mutationFn: () =>
      api.post(`/api/subscriptions/${subscription?.id}/pause`, {
        fromDate: pauseFrom,
        toDate: pauseTo,
      }),
    onSuccess: () => {
      setError(null);
      setNotice(t('paused'));
      refresh();
    },
    onError: handleError,
  });

  const resume = useMutation({
    mutationFn: () => api.post(`/api/subscriptions/${subscription?.id}/resume`),
    onSuccess: () => {
      setError(null);
      setNotice(null);
      refresh();
    },
    onError: handleError,
  });

  const cancel = useMutation({
    mutationFn: () =>
      api.post<{ refundedPaise: string }>(`/api/subscriptions/${subscription?.id}/cancel`),
    onSuccess: (data) => {
      const refunded = paise(data.refundedPaise);
      setError(null);
      setNotice(
        refunded > 0n
          ? `${t('cancelled')} · ${t('refunded', { amount: formatPaise(refunded) })}`
          : t('cancelled'),
      );
      refresh();
      void queryClient.invalidateQueries({ queryKey: ['wallet'] });
    },
    onError: handleError,
  });

  const changeAddress = useMutation({
    mutationFn: (addressId: string) =>
      api.patch(`/api/subscriptions/${subscription?.id}`, { addressId }),
    onSuccess: () => {
      setError(null);
      refresh();
    },
    onError: handleError,
  });

  if (current.isLoading) {
    return (
      <main className="pb-2">
        <div className="bg-card px-4 py-8 text-sm text-muted-foreground">{tc('loading')}</div>
      </main>
    );
  }

  if (!subscription) {
    return (
      <main className="pb-2">
        <div className="bg-card px-6 py-16 text-center">
          <p className="text-sm text-muted-foreground">{t('noSubscription')}</p>
          <Link href="/meal-plan" className="mt-4 inline-block text-sm font-semibold text-primary">
            {tc('back')}
          </Link>
        </div>
      </main>
    );
  }

  const isPaused = subscription.status === 'PAUSED';
  const isOver = subscription.status === 'CANCELLED' || subscription.status === 'COMPLETED';

  return (
    <>
      <header className="sticky top-0 z-30 flex items-center gap-2 border-b border-border bg-card px-3 py-3">
        <Link
          href="/meal-plan"
          aria-label={tc('back')}
          className="grid size-11 shrink-0 place-items-center rounded-full"
        >
          <ChevronLeft className="size-5" aria-hidden />
        </Link>
        <div className="min-w-0">
          <h1 className="text-base font-bold">{t('manage')}</h1>
          <p className="text-xs text-muted-foreground">
            {t('activeUntil', { date: subscription.endDate })} ·{' '}
            {t('daysLeft', { count: subscription.daysUntilEnd })}
          </p>
        </div>
      </header>

      <main className="space-y-2 pb-2">
      {(notice || error) && (
        <div className="bg-card px-4 py-4">
          {notice && (
            <p className="rounded-[var(--radius)] bg-primary/5 px-3 py-2.5 text-sm text-success">
              {notice}
            </p>
          )}
          {error && (
            <p className="mt-2 rounded-[var(--radius)] bg-danger/10 px-3 py-2.5 text-sm text-danger">
              {error}
            </p>
          )}
        </div>
      )}

      {/* ── Address for future deliveries */}
      <section className="bg-card px-4 py-4">
        <h2 className="text-sm font-semibold">{t('changeAddress')}</h2>
        <p className="mt-0.5 text-[11px] text-muted-foreground">{t('addressNote')}</p>

        <ul className="mt-3 space-y-2">
          {user?.addresses.map((address) => (
            <li key={address.id}>
              <button
                type="button"
                onClick={() => changeAddress.mutate(address.id)}
                disabled={isOver || changeAddress.isPending}
                aria-pressed={subscription.address.id === address.id}
                className={cn(
                  'flex w-full gap-2 rounded-[var(--radius)] border p-3 text-left disabled:opacity-60',
                  subscription.address.id === address.id
                    ? 'border-primary bg-primary/5'
                    : 'border-border bg-background',
                )}
              >
                <MapPin className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{address.label}</span>
                  <span className="block text-xs text-muted-foreground">
                    {address.line1}, {address.city} — {address.pincode}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      {/* ── Pause / resume */}
      <section className="bg-card px-4 py-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <CalendarRange className="size-4 text-primary" aria-hidden />
          {t('pauseTitle')}
        </h2>

        {isPaused ? (
          <button
            type="button"
            onClick={() => resume.mutate()}
            disabled={resume.isPending}
            className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-[var(--radius)] bg-primary text-sm font-bold text-primary-foreground disabled:opacity-50"
          >
            <PlayCircle className="size-4" aria-hidden />
            {t('resume')}
          </button>
        ) : (
          <>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="pause-from" className="text-xs font-medium">
                  {t('pauseFrom')}
                </label>
                <input
                  id="pause-from"
                  type="date"
                  value={pauseFrom}
                  min={subscription.startDate}
                  max={subscription.endDate}
                  onChange={(event) => setPauseFrom(event.target.value)}
                  className="input-3d mt-1 h-12 w-full rounded-[var(--radius)] border border-border/60 bg-background px-2 text-sm outline-none focus:border-primary"
                />
              </div>
              <div>
                <label htmlFor="pause-to" className="text-xs font-medium">
                  {t('pauseTo')}
                </label>
                <input
                  id="pause-to"
                  type="date"
                  value={pauseTo}
                  min={pauseFrom || subscription.startDate}
                  max={subscription.endDate}
                  onChange={(event) => setPauseTo(event.target.value)}
                  className="input-3d mt-1 h-12 w-full rounded-[var(--radius)] border border-border/60 bg-background px-2 text-sm outline-none focus:border-primary"
                />
              </div>
            </div>

            <button
              type="button"
              onClick={() => pause.mutate()}
              disabled={!pauseFrom || !pauseTo || isOver || pause.isPending}
              className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-[var(--radius)] border border-border text-sm font-semibold disabled:opacity-50"
            >
              <PauseCircle className="size-4" aria-hidden />
              {t('pause')}
            </button>
          </>
        )}
      </section>

      {/* ── Cancel. B3: unused money always goes back. */}
      {!isOver && (
        <section className="border-t-2 border-danger/30 bg-card px-4 py-4">
          <h2 className="text-sm font-semibold text-danger">{t('cancelTitle')}</h2>
          <button
            type="button"
            onClick={() => {
              if (confirm(t('cancelConfirm'))) cancel.mutate();
            }}
            disabled={cancel.isPending}
            className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-[var(--radius)] border border-danger text-sm font-semibold text-danger disabled:opacity-50"
          >
            <XCircle className="size-4" aria-hidden />
            {t('cancel')}
          </button>
        </section>
      )}
      </main>
    </>
  );
}
