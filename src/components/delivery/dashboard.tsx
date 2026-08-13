'use client';

import { useQuery } from '@tanstack/react-query';
import { ChevronRight, MapPin, Package } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { api } from '@/lib/api/client';
import { formatPaise, paise } from '@/lib/money';
import { cn } from '@/lib/utils';

/** M10 — "Today's assigned orders sorted by slot" plus the daily summary. */

type AssignmentStatus = 'ASSIGNED' | 'PICKED_UP' | 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'FAILED';

interface DeliveryOrderRow {
  assignmentId: string;
  orderId: string;
  orderNumber: string;
  status: AssignmentStatus;
  deliverySlot: string | null;
  customerName: string;
  address: { line1: string; city: string; pincode: string };
  items: Array<{ name: string }>;
  totalPaise: string;
  isCod: boolean;
}

interface Summary {
  delivered: number;
  failed: number;
  pending: number;
  codCollectedPaise: string;
}

const DONE_STATUSES: AssignmentStatus[] = ['DELIVERED', 'FAILED'];

export function DeliveryDashboard() {
  const t = useTranslations('delivery');
  const tc = useTranslations('common');

  const orders = useQuery({
    queryKey: ['delivery-orders'],
    queryFn: () => api.get<{ orders: DeliveryOrderRow[] }>('/api/delivery/orders'),
    refetchInterval: 60_000,
  });

  const summary = useQuery({
    queryKey: ['delivery-summary'],
    queryFn: () => api.get<{ summary: Summary }>('/api/delivery/summary'),
    refetchInterval: 60_000,
  });

  const rows = orders.data?.orders ?? [];
  const s = summary.data?.summary;

  return (
    <div className="space-y-4">
      {s && (
        <div className="grid grid-cols-4 gap-2 rounded-[var(--radius)] bg-card p-3 text-center">
          <SummaryStat value={s.delivered} label={t('summaryDelivered')} />
          <SummaryStat value={s.pending} label={t('summaryPending')} />
          <SummaryStat value={s.failed} label={t('summaryFailed')} tone="danger" />
          <div>
            <p className="text-base font-black tabular-nums">
              {formatPaise(paise(s.codCollectedPaise), { hidePaise: true })}
            </p>
            <p className="text-[10px] text-muted-foreground">{t('summaryCod')}</p>
          </div>
        </div>
      )}

      {orders.isLoading ? (
        <p className="text-sm text-muted-foreground">{tc('loading')}</p>
      ) : rows.length === 0 ? (
        <p className="rounded-[var(--radius)] border border-dashed border-border bg-card px-4 py-10 text-center text-sm text-muted-foreground">
          {t('noOrdersToday')}
        </p>
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => {
            const done = DONE_STATUSES.includes(row.status);
            return (
              <li key={row.assignmentId}>
                <Link
                  href={`/delivery/orders/${row.orderId}`}
                  className={cn(
                    'flex items-center gap-3 rounded-[var(--radius)] border border-border bg-card p-3',
                    done && 'opacity-60',
                  )}
                >
                  <span className="grid size-10 shrink-0 place-items-center rounded-full bg-secondary">
                    <Package className="size-4 text-muted-foreground" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-semibold">{row.customerName}</span>
                      <StatusPill status={row.status} />
                    </span>
                    <span className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                      <MapPin className="size-3 shrink-0" aria-hidden />
                      <span className="truncate">
                        {row.address.line1}, {row.address.city}
                      </span>
                    </span>
                    <span className="mt-0.5 block text-[11px] text-muted-foreground">
                      {t('itemCount', { count: row.items.length })}
                      {row.isCod && ` · ${t('codBadge')} ${formatPaise(paise(row.totalPaise))}`}
                    </span>
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function SummaryStat({
  value,
  label,
  tone,
}: {
  value: number;
  label: string;
  tone?: 'danger';
}) {
  return (
    <div>
      <p className={cn('text-base font-black tabular-nums', tone === 'danger' && 'text-danger')}>
        {value}
      </p>
      <p className="text-[10px] text-muted-foreground">{label}</p>
    </div>
  );
}

export function StatusPill({ status }: { status: AssignmentStatus }) {
  const t = useTranslations('delivery.status');
  const tone: Record<AssignmentStatus, string> = {
    ASSIGNED: 'bg-secondary text-muted-foreground',
    PICKED_UP: 'bg-[#FDF3E3] text-warning',
    OUT_FOR_DELIVERY: 'bg-primary/10 text-primary',
    DELIVERED: 'bg-success/10 text-success',
    FAILED: 'bg-danger/10 text-danger',
  };
  return (
    <span
      className={cn('shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold', tone[status])}
    >
      {t(status)}
    </span>
  );
}
