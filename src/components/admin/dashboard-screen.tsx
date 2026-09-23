'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BarChart3,
  CreditCard,
  IndianRupee,
  Loader2,
  MessageCircle,
  Package,
  RefreshCw,
  Salad,
  ShoppingBag,
  Truck,
  Users,
  Warehouse,
} from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { Link } from '@/i18n/navigation';
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
import { api, qs } from '@/lib/api/client';

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

/** The mobile dashboard's quick-nav row (session 2026-09-22, new client
    reference) — same 4 real routes `AdminBottomNav` (admin-shell.tsx)
    links to, deliberately kept identical rather than picking a second,
    different set of "top 4" destinations. */
const QUICK_NAV_SECTIONS = [
  { key: 'orders', href: '/admin/orders', icon: ShoppingBag },
  { key: 'catalogue', href: '/admin/catalogue', icon: Package },
  { key: 'inventory', href: '/admin/inventory', icon: Warehouse },
  { key: 'customers', href: '/admin/customers', icon: Users },
] as const;

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
  const tNav = useTranslations('admin.nav');
  const locale = useLocale();
  const queryClient = useQueryClient();
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
  const heroAlt = `${t('heroTaglineDark')} ${t('heroTaglineGreen')} ${t('welcomeSubtitle')}`;

  return (
    <div>
      {/* The date-range dropdown no longer lives here (session 2026-09-21,
          new client reference) — it's moved down into the action row below
          the hero banner, beside "Run it again", matching the reference's
          layout where the page title carries no controls of its own. */}
      <AdminPageHeader title={te('title')} subtitle={te('subtitle')} />

      {notice && (
        <p className="mb-4 rounded-[var(--radius)] bg-primary/5 px-4 py-3 text-sm">{notice}</p>
      )}

      {/* Welcome hero (session 2026-09-23, client request — "use the
          reference banner image directly", mirroring the fix already
          applied to the storefront home page's own hero). Replaces the
          previous HTML recreation with the reference's own hero graphic
          as-is (greeting/headline/feature icons/quote/photo, all baked
          into one image). Trade-off, discussed with the client and
          accepted: the baked-in "Good Morning, Krupal!" is the mockup's
          own placeholder copy, not a real per-admin greeting — every
          admin now sees the same static English image rather than their
          own name/time-of-day/locale. The one real interactive element,
          "View Store" (→ the actual storefront), stays working via a
          transparent `Link` laid over its baked-in position — desktop
          only, since the reference's own mobile crop doesn't show it. */}
      <div className="relative mb-3 overflow-hidden rounded-[var(--radius-2xl)] border border-primary/10">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/admin-hero-mobile.png" alt={heroAlt} className="block w-full sm:hidden" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/admin-hero-desktop.png" alt={heroAlt} className="hidden w-full sm:block" />

        <Link
          href="/"
          aria-label={t('viewStore')}
          className="absolute top-[66%] left-[83%] hidden h-[24%] w-[15%] sm:block"
        />
      </div>

      {/* Action row (session 2026-09-21, new client reference) — replaces
          the old boxed cron-status card entirely, per the client's explicit
          choice: just the date-range control and a plain "Run it again"
          pill, no descriptive alert text. `regenerate` is still the same
          real mutation the old card's button called; only the presentation
          changed. Still gated on `cron` being loaded, so the pill never
          renders before there's a real day to regenerate. */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        {tab === 'analytics' ? (
          <DateRangeDropdown
            value={range}
            onChange={(next) => setRange(next as DashboardRange)}
            keys={ANALYTICS_RANGE_OPTIONS}
          />
        ) : (
          <span />
        )}

        {cron && (
          <button
            type="button"
            onClick={() => regenerate.mutate()}
            disabled={regenerate.isPending}
            className="flex h-10 shrink-0 items-center justify-center gap-2 rounded-full bg-primary px-4 text-xs font-semibold text-primary-foreground disabled:opacity-50"
          >
            {regenerate.isPending ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
            ) : (
              <RefreshCw className="size-3.5" aria-hidden />
            )}
            {regenerate.isPending ? t('regenerating') : t('regenerate')}
          </button>
        )}
      </div>

      {/* Mobile quick-nav row (session 2026-09-22, new client reference) —
          4 real routes (the same ones the new AdminBottomNav bar links
          to), desktop-hidden since the sidebar already covers this there.
          Mirrors the exact icon/route pairing admin-shell.tsx's own
          bottom-nav sections use, for one consistent set of "the 4 most
          common admin destinations" rather than two different picks. */}
      <div className="mb-4 grid grid-cols-4 gap-2 lg:hidden">
        {QUICK_NAV_SECTIONS.map((section) => (
          <Link
            key={section.key}
            href={section.href}
            className="flex flex-col items-center gap-1.5 rounded-[var(--radius)] bg-tint-green px-1 py-3"
          >
            <section.icon className="size-5 text-primary" aria-hidden />
            <span className="text-[11px] font-semibold text-primary-dark">{tNav(section.key)}</span>
          </Link>
        ))}
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
