'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  CreditCard,
  IndianRupee,
  Leaf,
  Loader2,
  MessageCircle,
  RefreshCw,
  Salad,
  ShoppingBag,
  TrendingUp,
  Truck,
  Users,
  Warehouse,
} from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { AdminPageHeader } from '@/components/admin/admin-shell';
import { DateRangeDropdown, ExplorerEmpty, ExplorerTabs, type ExplorerTab } from '@/components/admin/explorer';
import {
  ANALYTICS_RANGE_OPTIONS,
  AnalyticsExplorerTab,
  type DashboardRange,
} from '@/components/admin/tabs/analytics-tab';
import { CustomersExplorerTab } from '@/components/admin/tabs/customers-tab';
import { DeliveriesExplorerTab } from '@/components/admin/tabs/deliveries-tab';
import { InventoryExplorerTab } from '@/components/admin/tabs/inventory-tab';
import { OrdersExplorerTab } from '@/components/admin/tabs/orders-tab';
import { PaymentsExplorerTab } from '@/components/admin/tabs/payments-tab';
import { PlansExplorerTab } from '@/components/admin/tabs/plans-tab';
import { RevenueExplorerTab } from '@/components/admin/tabs/revenue-tab';
import { useSession } from '@/hooks/use-session';
import { api, qs } from '@/lib/api/client';
import { cn } from '@/lib/utils';

/** Real photo cropped out of the client's own reference mockup (session
    2026-09-21, D:\Downloads\ChatGPT Image Sep 21, 2026, 09_08_11 AM.png) —
    purely decorative, not tied to any data, same reasoning as every other
    cropped-reference-image asset this session. */
const HERO_IMAGE =
  'https://res.cloudinary.com/kf9nvvpv/image/upload/v1789964539/planeat/admin/admin-dashboard-hero-veg-crate.png';

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
  { key: 'analytics', label: '', icon: BarChart3 },
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
  const { user } = useSession();
  const [notice, setNotice] = useState<string | null>(null);
  const [tab, setTab] = useState('analytics');
  const [range, setRange] = useState<DashboardRange>('30d');

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
  const adminName = user?.name ?? user?.phone ?? '';

  return (
    <div>
      <AdminPageHeader
        title={te('title')}
        subtitle={te('subtitle')}
        // Only the Analytics tab has a date range to show — client
        // screenshot: the "Last 14 days / Last 30 days / This month" row
        // used to sit below the tabs as a duplicate of this same control;
        // it's been removed from analytics-tab.tsx (see that file) in
        // favour of this one, header-level dropdown.
        action={
          tab === 'analytics' ? (
            <DateRangeDropdown
              value={range}
              onChange={(next) => setRange(next as DashboardRange)}
              keys={ANALYTICS_RANGE_OPTIONS}
            />
          ) : undefined
        }
      />

      {notice && (
        <p className="mb-4 rounded-[var(--radius)] bg-primary/5 px-4 py-3 text-sm">{notice}</p>
      )}

      {/* Welcome hero (session 2026-09-21, client reference mockup) — real
          photo cropped from that same mockup (HERO_IMAGE above), same
          gradient recipe the storefront's own home-page hero banner uses.
          The cron-health card sits beside it, not below it any more — same
          real data and the same danger/success colouring when there's
          actually something wrong, just repositioned to match the
          reference's layout rather than duplicated. */}
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-stretch">
        <div
          className="relative flex flex-1 items-center gap-4 overflow-hidden rounded-[var(--radius-2xl)] border border-primary/10 px-6 py-5"
          style={{
            background: 'linear-gradient(120deg, var(--brand-tint-green) 0%, var(--brand-tint-yellow) 100%)',
          }}
        >
          <Leaf
            aria-hidden
            className="pointer-events-none absolute -top-4 -left-4 size-20 -rotate-12 text-primary/15"
          />

          <div className="relative z-10 min-w-0 flex-1">
            <p className="text-[11px] font-bold tracking-wide text-muted-foreground uppercase">
              {t('welcomeBack')}
            </p>
            <p className="mt-0.5 truncate text-2xl font-black text-primary-dark">
              {adminName} <span aria-hidden>👋</span>
            </p>
            <p className="mt-1 text-sm text-muted-foreground">{t('welcomeSubtitle')}</p>
          </div>

          {/* Decorative handwritten-style tagline, matching the reference —
              hidden below `sm:` rather than wrapping awkwardly next to the
              photo on a narrow phone. */}
          <p
            aria-hidden
            className="relative z-10 hidden shrink-0 -rotate-3 text-right font-serif text-sm text-primary-dark/60 italic whitespace-pre-line sm:block"
          >
            {t('welcomeTagline')}
          </p>

          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={HERO_IMAGE}
            alt=""
            aria-hidden
            className="relative z-10 hidden h-28 w-auto shrink-0 rounded-2xl object-contain shadow-md md:block"
          />
        </div>

        {cron && (
          <section
            className={cn(
              'card-3d flex w-full shrink-0 flex-col justify-between gap-3 rounded-[var(--radius-2xl)] border px-4 py-4 lg:w-72',
              cron.alert ? 'border-danger/50 bg-danger/10' : 'border-success/30 bg-primary/5',
            )}
          >
            <div className="flex items-start gap-3">
              {cron.alert ? (
                <AlertTriangle className="mt-0.5 size-5 shrink-0 text-danger" aria-hidden />
              ) : (
                <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" aria-hidden />
              )}
              <div className="min-w-0">
                <p className="text-sm font-semibold">{t('cronTitle')}</p>
                <p className={cn('mt-0.5 text-xs', cron.alert ? 'text-danger' : 'text-muted-foreground')}>
                  {cron.alert
                    ? `${t('cronAlert')} ${t('cronAlertHint', { count: cron.activeSubscriptions })}`
                    : t('cronOk', { count: cron.ordersGenerated })}
                </p>
              </div>
            </div>

            {!cron.alert && (
              <p className="flex items-center gap-1.5 text-[11px] font-medium text-success">
                <TrendingUp className="size-3.5 shrink-0" aria-hidden />
                {t('storePerformanceGlance')}
              </p>
            )}

            <button
              type="button"
              onClick={() => regenerate.mutate()}
              disabled={regenerate.isPending}
              className="flex h-10 w-full shrink-0 items-center justify-center gap-2 rounded-[var(--radius)] border border-border bg-card px-3 text-xs font-semibold disabled:opacity-50"
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
      </div>

      <ExplorerTabs tabs={tabs} active={tab} onChange={setTab} />

      <div className="mt-4">
        {tab === 'analytics' ? (
          <AnalyticsExplorerTab range={range} onOpenTab={setTab} />
        ) : tab === 'orders' ? (
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
