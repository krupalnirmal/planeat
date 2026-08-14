'use client';

import { useQuery } from '@tanstack/react-query';
import { ArrowDownLeft, ArrowUpRight, Clock, Plus, TriangleAlert } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import { TopupSheet } from '@/components/wallet/topup-sheet';
import { useSession } from '@/hooks/use-session';
import { api, qs } from '@/lib/api/client';
import { formatPaise, paise } from '@/lib/money';
import { cn } from '@/lib/utils';

/** Wallet screen (M7): balance, top-up chips, statement with running balance. */

type WalletSource =
  | 'TOPUP'
  | 'ORDER'
  | 'PLAN_FEE'
  | 'REFUND'
  | 'ADJUSTMENT'
  | 'COMPLAINT_CREDIT'
  | 'CANCELLATION';

interface WalletResponse {
  balancePaise: string;
  lowBalanceThresholdPaise: string;
  isLowBalance: boolean;
  pendingTopupPaise: string;
  topupPresetsPaise: string[];
  minimumTopupPaise: string;
}

interface TransactionsResponse {
  transactions: Array<{
    id: string;
    direction: 'CREDIT' | 'DEBIT';
    amountPaise: string;
    source: WalletSource;
    balanceAfterPaise: string;
    note: string | null;
    createdAt: string;
  }>;
}

type Filter = 'ALL' | 'CREDIT' | 'DEBIT';

export function WalletScreen() {
  const t = useTranslations('wallet');
  const tc = useTranslations('common');
  const te = useTranslations('errors');
  const format = useFormatter();
  const router = useRouter();
  const { isLoggedIn, isLoading: sessionLoading } = useSession();

  const [filter, setFilter] = useState<Filter>('ALL');
  const [topupOpen, setTopupOpen] = useState(false);

  const wallet = useQuery({
    queryKey: ['wallet'],
    queryFn: () => api.get<WalletResponse>('/api/wallet'),
    enabled: isLoggedIn,
  });

  const transactions = useQuery({
    queryKey: ['wallet-transactions', filter],
    queryFn: () =>
      api.get<TransactionsResponse>(
        `/api/wallet/transactions${qs({ direction: filter === 'ALL' ? undefined : filter })}`,
      ),
    enabled: isLoggedIn,
  });

  if (sessionLoading) {
    return (
      <main className="pb-2">
        <div className="bg-card px-4 py-8 text-sm text-muted-foreground">{tc('loading')}</div>
      </main>
    );
  }

  if (!isLoggedIn) {
    return (
      <main className="pb-2">
        <div className="bg-card px-6 py-16 text-center">
          <p className="text-sm text-muted-foreground">{te('unauthorized')}</p>
          <button
            type="button"
            onClick={() => router.push('/login?next=/wallet')}
            className="mt-4 h-12 w-full rounded-[var(--radius)] bg-primary text-sm font-bold text-primary-foreground"
          >
            {tc('next')}
          </button>
        </div>
      </main>
    );
  }

  const balance = paise(wallet.data?.balancePaise ?? '0');
  const pendingTopup = paise(wallet.data?.pendingTopupPaise ?? '0');
  const rows = transactions.data?.transactions ?? [];

  return (
    <main className="space-y-2 pb-2">
      <div className="bg-card px-4 py-4">
      <h1 className="mb-4 text-xl font-bold">{t('title')}</h1>

      <section className="rounded-[var(--radius)] bg-primary px-5 py-6 text-primary-foreground">
        <p className="text-xs opacity-85">{t('balance')}</p>
        <p className="mt-1 text-3xl font-bold">{formatPaise(balance)}</p>

        <button
          type="button"
          onClick={() => setTopupOpen(true)}
          disabled={!wallet.data}
          className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-[var(--radius)] bg-primary-foreground/15 text-sm font-bold disabled:opacity-50"
        >
          <Plus className="size-4" aria-hidden />
          {t('topUp')}
        </button>
      </section>

      {/* A top-up that has been started but not confirmed. Showing it stops
          somebody paying twice because the first one "didn't work". */}
      {pendingTopup > 0n && (
        <p className="mt-3 flex items-center gap-2 rounded-[var(--radius)] bg-secondary px-3 py-2.5 text-xs">
          <Clock className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          {t('pendingTopup', { amount: formatPaise(pendingTopup, { hidePaise: true }) })}
        </p>
      )}

      {/* B10 — the low-balance threshold is ₹200 and lives in app_settings. */}
      {wallet.data?.isLowBalance && (
        <p className="mt-3 flex items-start gap-2 rounded-[var(--radius)] bg-[#FDF3E3] px-3 py-2.5 text-xs text-warning">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {t('lowBalance')}
        </p>
      )}
      </div>

      <div className="bg-card px-4 py-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-semibold">{t('transactions')}</h2>
        <div className="flex gap-1">
          {(
            [
              ['ALL', 'filterAll'],
              ['CREDIT', 'filterCredits'],
              ['DEBIT', 'filterDebits'],
            ] as const
          ).map(([value, labelKey]) => (
            <button
              key={value}
              type="button"
              onClick={() => setFilter(value)}
              aria-pressed={filter === value}
              className={cn(
                'min-h-9 rounded-full px-3 text-xs',
                filter === value
                  ? 'bg-primary text-primary-foreground font-semibold'
                  : 'bg-background text-muted-foreground',
              )}
            >
              {t(labelKey)}
            </button>
          ))}
        </div>
      </div>

      {transactions.isLoading && <p className="text-sm text-muted-foreground">{tc('loading')}</p>}

      {!transactions.isLoading && rows.length === 0 && (
        <p className="rounded-[var(--radius)] border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
          {t('noTransactions')}
        </p>
      )}

      <ul className="divide-y divide-border overflow-hidden rounded-[var(--radius)] border border-border/60">
        {rows.map((row) => {
          const isCredit = row.direction === 'CREDIT';
          return (
            <li key={row.id} className="flex items-center gap-3 bg-background px-4 py-3">
              <span
                className={cn(
                  'grid size-9 shrink-0 place-items-center rounded-full',
                  isCredit ? 'bg-primary/10 text-success' : 'bg-secondary text-muted-foreground',
                )}
              >
                {isCredit ? (
                  <ArrowDownLeft className="size-4" aria-hidden />
                ) : (
                  <ArrowUpRight className="size-4" aria-hidden />
                )}
              </span>

              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">
                  {row.note ?? t(`source.${row.source}`)}
                </span>
                <span className="block text-[11px] text-muted-foreground">
                  {format.dateTime(new Date(row.createdAt), {
                    day: 'numeric',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                  {' · '}
                  {/* The balance recorded WITH this row, not recomputed for
                      this page — a filtered view must still add up. */}
                  {t('runningBalance', {
                    amount: formatPaise(paise(row.balanceAfterPaise), { hidePaise: true }),
                  })}
                </span>
              </span>

              <span
                className={cn(
                  'shrink-0 text-sm font-bold tabular-nums',
                  isCredit ? 'text-success' : 'text-foreground',
                )}
              >
                {isCredit ? '+' : '−'}
                {formatPaise(paise(row.amountPaise), { withSymbol: true, hidePaise: true })}
              </span>
            </li>
          );
        })}
      </ul>

      {topupOpen && wallet.data && (
        <TopupSheet
          presetsPaise={wallet.data.topupPresetsPaise}
          minimumPaise={wallet.data.minimumTopupPaise}
          onClose={() => setTopupOpen(false)}
        />
      )}
      </div>
    </main>
  );
}
