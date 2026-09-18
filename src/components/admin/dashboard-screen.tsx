'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  CheckCircle2,
  CreditCard,
  IndianRupee,
  Loader2,
  MessageCircle,
  RefreshCw,
  Salad,
  ShoppingBag,
  Truck,
  Users,
  Warehouse,
} from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { AdminPageHeader } from '@/components/admin/admin-shell';
import { ExplorerEmpty, ExplorerTabs, type ExplorerTab } from '@/components/admin/explorer';
import { CustomersExplorerTab } from '@/components/admin/tabs/customers-tab';
import { DeliveriesExplorerTab } from '@/components/admin/tabs/deliveries-tab';
import { InventoryExplorerTab } from '@/components/admin/tabs/inventory-tab';
import { OrdersExplorerTab } from '@/components/admin/tabs/orders-tab';
import { PaymentsExplorerTab } from '@/components/admin/tabs/payments-tab';
import { PlansExplorerTab } from '@/components/admin/tabs/plans-tab';
import { RevenueExplorerTab } from '@/components/admin/tabs/revenue-tab';
import { api, qs } from '@/lib/api/client';
import { cn } from '@/lib/utils';

/**
 * Admin dashboard v2 (session 2026-09-18) — replaces the stat-tile/
 * sparkline/donut/pipeline dashboard shipped a few commits ago
 * (`ad50115`/`8ca972a`/`5a8a0fd`) with a tabbed master-detail explorer,
 * matching a new client reference: 8 tabs (Orders/Revenue/Deliveries/
 * Payments/Customers/Plans/Inventory/Complaints), each a searchable,
 * date-filtered, paginated list on the left and a detail panel on the
 * right for whichever row is selected.
 *
 * Only Orders ships in this pass (Part K) — the one tab with zero real
 * backend gap (`listAdminOrders` + the existing order-detail query already
 * cover everything the reference's right panel needs). The other 7 are
 * real, sequenced follow-ups (Parts L–R in the session's plan) — they show
 * an honest "coming soon" rather than fabricated rows, since e.g.
 * Complaints has no admin list/detail query behind it at all yet.
 *
 * The cron-health alert banner is the one piece kept from the old
 * dashboard: unlike the stat tiles/charts it replaced, it's operationally
 * load-bearing, not cosmetic — a silent cron failure means nobody gets
 * vegetables, and the owner otherwise only finds out from phone calls at
 * 07:00.
 */

interface CronMetrics {
  dateKey: string;
  cron: {
    targetDate: string;
    activeSubscriptions: number;
    ordersGenerated: number;
    paymentPending: number;
    alert: boolean;
  };
}

const TABS: ExplorerTab[] = [
  { key: 'orders', label: '', icon: ShoppingBag },
  { key: 'revenue', label: '', icon: IndianRupee },
  { key: 'deliveries', label: '', icon: Truck },
  { key: 'payments', label: '', icon: CreditCard },
  { key: 'customers', label: '', icon: Users },
  { key: 'plans', label: '', icon: Salad },
  { key: 'inventory', label: '', icon: Warehouse },
  { key: 'complaints', label: '', icon: MessageCircle },
];

export function AdminDashboard() {
  const t = useTranslations('admin.dashboard');
  const te = useTranslations('admin.explorer');
  const tc = useTranslations('admin.common');
  const locale = useLocale();
  const queryClient = useQueryClient();
  const [notice, setNotice] = useState<string | null>(null);
  const [tab, setTab] = useState('orders');

  const metrics = useQuery({
    queryKey: ['admin-dashboard-cron', locale],
    queryFn: () => api.get<CronMetrics>(`/api/admin/dashboard${qs({ locale })}`),
    refetchInterval: 60_000,
    placeholderData: (previous) => previous,
  });

  const regenerate = useMutation({
    mutationFn: () => api.post<{ created: number; duplicates: number }>('/api/admin/cron-health'),
    onSuccess: (data) => {
      setNotice(t('regenerated', { created: data.created, duplicates: data.duplicates }));
      void queryClient.invalidateQueries({ queryKey: ['admin-dashboard-cron'] });
    },
    onError: () => setNotice(tc('failed')),
  });

  const tabs = TABS.map((entry) => ({ ...entry, label: te(`tabs.${entry.key}`) }));
  const cron = metrics.data?.cron;

  return (
    <div>
      <AdminPageHeader title={te('title')} subtitle={te('subtitle')} />

      {notice && (
        <p className="mb-4 rounded-[var(--radius)] bg-primary/5 px-4 py-3 text-sm">{notice}</p>
      )}

      {cron && (
        <section
          className={cn(
            'card-3d mb-4 flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius)] border px-4 py-3',
            cron.alert ? 'border-danger/50 bg-danger/10' : 'border-success/30 bg-primary/5',
          )}
        >
          <div className="flex items-start gap-3">
            {cron.alert ? (
              <AlertTriangle className="mt-0.5 size-5 shrink-0 text-danger" aria-hidden />
            ) : (
              <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" aria-hidden />
            )}
            <div>
              <p className="text-sm font-semibold">{t('cronTitle')}</p>
              <p className={cn('mt-0.5 text-xs', cron.alert ? 'text-danger' : 'text-muted-foreground')}>
                {cron.alert
                  ? `${t('cronAlert')} ${t('cronAlertHint', { count: cron.activeSubscriptions })}`
                  : t('cronOk', { count: cron.ordersGenerated })}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => regenerate.mutate()}
            disabled={regenerate.isPending}
            className="flex h-10 shrink-0 items-center gap-2 rounded-[var(--radius)] border border-border bg-card px-3 text-xs font-semibold disabled:opacity-50"
          >
            {regenerate.isPending ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
            ) : (
              <RefreshCw className="size-3.5" aria-hidden />
            )}
            {regenerate.isPending ? t('regenerating') : t('regenerate')}
          </button>
        </section>
      )}

      <ExplorerTabs tabs={tabs} active={tab} onChange={setTab} />

      <div className="mt-4">
        {tab === 'orders' ? (
          <OrdersExplorerTab />
        ) : tab === 'revenue' ? (
          <RevenueExplorerTab />
        ) : tab === 'deliveries' ? (
          <DeliveriesExplorerTab />
        ) : tab === 'payments' ? (
          <PaymentsExplorerTab />
        ) : tab === 'customers' ? (
          <CustomersExplorerTab />
        ) : tab === 'plans' ? (
          <PlansExplorerTab />
        ) : tab === 'inventory' ? (
          <InventoryExplorerTab />
        ) : (
          <ExplorerEmpty label={te('comingSoon')} />
        )}
      </div>
    </div>
  );
}
