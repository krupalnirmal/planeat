'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Package, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { SupplyForm } from '@/components/vendor/supply-form';
import { api } from '@/lib/api/client';
import { formatPaise, paise } from '@/lib/money';
import { cn } from '@/lib/utils';

/** The vendor dashboard — balance owed, "report a delivery", and supply history. */

type SupplyStatus = 'PENDING' | 'CONFIRMED' | 'REJECTED';

interface SupplyRow {
  id: string;
  productName: string;
  variantLabel: string;
  quantity: number;
  costPricePaise: string;
  status: SupplyStatus;
  rejectionReason: string | null;
  createdAt: string;
}

export function VendorDashboard() {
  const t = useTranslations('vendor');
  const tc = useTranslations('common');
  const queryClient = useQueryClient();

  const [showForm, setShowForm] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const me = useQuery({
    queryKey: ['vendor-me'],
    queryFn: () => api.get<{ businessName: string; balancePaise: string }>('/api/vendor/me'),
  });

  const supplies = useQuery({
    queryKey: ['vendor-supplies'],
    queryFn: () => api.get<{ supplies: SupplyRow[] }>('/api/vendor/supplies'),
    refetchInterval: 60_000,
  });

  const rows = supplies.data?.supplies ?? [];

  return (
    <div className="space-y-4">
      <div className="rounded-[var(--radius)] bg-card p-4">
        <p className="text-xs text-muted-foreground">{t('balanceOwed')}</p>
        <p className="text-2xl font-black tabular-nums">
          {me.data ? formatPaise(paise(me.data.balancePaise)) : '—'}
        </p>
      </div>

      {notice && (
        <p className="rounded-[var(--radius)] bg-primary/5 px-3 py-2.5 text-sm">{notice}</p>
      )}

      {showForm ? (
        <SupplyForm
          onDone={(message) => {
            setNotice(message);
            setShowForm(false);
            void queryClient.invalidateQueries({ queryKey: ['vendor-me'] });
          }}
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
          {t('reportDelivery')}
        </button>
      )}

      <section>
        <h2 className="mb-2 text-sm font-bold">{t('supplyHistory')}</h2>
        {supplies.isLoading ? (
          <p className="text-sm text-muted-foreground">{tc('loading')}</p>
        ) : rows.length === 0 ? (
          <p className="rounded-[var(--radius)] border border-dashed border-border bg-card px-4 py-10 text-center text-sm text-muted-foreground">
            {t('noSuppliesYet')}
          </p>
        ) : (
          <ul className="space-y-2">
            {rows.map((row) => (
              <SupplyRowItem key={row.id} row={row} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function SupplyRowItem({ row }: { row: SupplyRow }) {
  const t = useTranslations('vendor');

  return (
    <li className="flex items-center gap-3 rounded-[var(--radius)] border border-border bg-card p-3">
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-secondary">
        <Package className="size-4 text-muted-foreground" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-sm font-semibold">{row.productName}</span>
          <StatusPill status={row.status} />
        </span>
        <span className="mt-0.5 block text-xs text-muted-foreground">
          {row.quantity} {row.variantLabel} · {formatPaise(paise(row.costPricePaise))}/{t('unit')}
        </span>
        {row.rejectionReason && (
          <span className="mt-0.5 block text-xs text-danger">{row.rejectionReason}</span>
        )}
      </span>
    </li>
  );
}

function StatusPill({ status }: { status: SupplyStatus }) {
  const t = useTranslations('vendor.status');
  const tone: Record<SupplyStatus, string> = {
    PENDING: 'bg-[#FDF3E3] text-warning',
    CONFIRMED: 'bg-tint-green text-primary-dark',
    REJECTED: 'bg-danger/10 text-danger',
  };
  return (
    <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold', tone[status])}>
      {t(status)}
    </span>
  );
}
