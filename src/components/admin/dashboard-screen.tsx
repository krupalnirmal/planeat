'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRight,
  BarChart3,
  CreditCard,
  Heart,
  IndianRupee,
  Leaf,
  Loader2,
  MessageCircle,
  Package,
  RefreshCw,
  Salad,
  ShoppingBag,
  TrendingUp,
  Truck,
  Users,
  Warehouse,
} from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState, useSyncExternalStore } from 'react';
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
import { useSession } from '@/hooks/use-session';
import { api, qs } from '@/lib/api/client';

/** Real photo cropped out of the client's own reference mockup (session
    2026-09-21, D:\Downloads\ChatGPT Image Sep 21, 2026, 09_08_11 AM.png) —
    purely decorative, not tied to any data, same reasoning as every other
    cropped-reference-image asset this session. */
const HERO_IMAGE =
  'https://res.cloudinary.com/kf9nvvpv/image/upload/v1789964539/planeat/admin/admin-dashboard-hero-veg-crate.png';

/** Real time-of-day greeting (session 2026-09-21, new client reference) —
    replaces the old static "Welcome back," per the mockup's "Good
    Morning,". Local device hours, same as any other client-rendered clock
    in this app — the admin's own device time is the right frame here, not
    IST specifically. */
function greetingKey(hour: number): 'greetingMorning' | 'greetingAfternoon' | 'greetingEvening' {
  if (hour < 12) return 'greetingMorning';
  if (hour < 17) return 'greetingAfternoon';
  return 'greetingEvening';
}

// Read through `useSyncExternalStore` rather than a `useEffect` + setState —
// same reasoning as `InstallPrompt`'s own client-only reads
// (src/components/shop/install-prompt.tsx): the hour genuinely never
// changes after mount for this component's lifetime, so there's nothing to
// subscribe to, and this avoids a setState-in-effect render cascade.
function subscribeNever() {
  return () => {};
}
function getClientHour(): number {
  return new Date().getHours();
}
function getServerHour(): number {
  return 9; // SSR-safe default (morning) — corrected to the real hour on hydration.
}

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

/** The hero's decorative feature-icon row (session 2026-09-22, new client
    reference) — no real metric behind any of these, same "generic,
    non-measurable marketing copy" treatment this session has used
    elsewhere (e.g. the storefront PDP's "Freshly picked"/"Quality
    checked"), not a fabricated stat. */
const HERO_FEATURES = [
  { key: 'heroFeatureProducts', icon: Leaf },
  { key: 'heroFeatureDelivery', icon: Truck },
  { key: 'heroFeatureCustomers', icon: Heart },
  { key: 'heroFeatureGrowth', icon: TrendingUp },
] as const;

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
  const { user } = useSession();
  const [notice, setNotice] = useState<string | null>(null);
  const [tab, setTab] = useState('analytics');
  const [range, setRange] = useState<DashboardRange>('30d');
  const hour = useSyncExternalStore(subscribeNever, getClientHour, getServerHour);

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
      {/* The date-range dropdown no longer lives here (session 2026-09-21,
          new client reference) — it's moved down into the action row below
          the hero banner, beside "Run it again", matching the reference's
          layout where the page title carries no controls of its own. */}
      <AdminPageHeader title={te('title')} subtitle={te('subtitle')} />

      {notice && (
        <p className="mb-4 rounded-[var(--radius)] bg-primary/5 px-4 py-3 text-sm">{notice}</p>
      )}

      {/* Welcome hero (session 2026-09-21, client reference mockup) — real
          photo cropped from that same mockup (HERO_IMAGE above), same
          gradient recipe the storefront's own home-page hero banner uses. */}
      <div className="mb-3">
        <div
          className="relative flex items-center gap-2 overflow-hidden rounded-[var(--radius-2xl)] border border-primary/10 px-4 py-4 sm:gap-4 sm:px-6 sm:py-5"
          style={{
            background: 'linear-gradient(120deg, var(--brand-tint-green) 0%, var(--brand-tint-yellow) 100%)',
          }}
        >
          <Leaf
            aria-hidden
            className="pointer-events-none absolute -top-4 -left-4 size-20 -rotate-12 text-primary/15"
          />

          <div className="relative z-10 min-w-0 flex-1">
            {/* Greeting + real admin name on one smaller line (session
                2026-09-22, new client reference) — used to be a small
                uppercase label with the name as its own big bold line;
                the reference instead gives that big-bold treatment to a
                new headline below, so the greeting+name demote to one
                line together. `greetingMorning`/etc already end in a
                comma ("Good Morning,"), which is exactly what reads right
                immediately before the name here. */}
            <p className="truncate text-xs font-semibold text-muted-foreground sm:text-sm">
              {t(greetingKey(hour))} <span className="font-bold text-foreground">{adminName}</span>{' '}
              <span aria-hidden>👋</span>
            </p>
            {/* New two-tone headline (session 2026-09-22, new client
                reference) — echoes the logo's own dark/green split, first
                real use of the new `--navy` token. */}
            <p className="mt-0.5 truncate text-xl leading-tight font-black sm:text-2xl">
              <span className="text-navy">{t('heroTaglineDark')}</span>{' '}
              <span className="text-primary">{t('heroTaglineGreen')}</span>
            </p>
            <p className="mt-1 truncate text-xs text-muted-foreground sm:text-sm">{t('welcomeSubtitle')}</p>

            {/* Feature-icon row + quote/CTA card (session 2026-09-22, new
                client reference) — desktop only: the reference's own
                mobile crop doesn't show either, and a phone-width hero
                already has its hands full with the photo/tagline it
                already carries. Both are decorative except the "View
                Store" link, which is real (→ the actual storefront). */}
            <div className="mt-5 hidden flex-wrap items-center gap-5 lg:flex">
              {HERO_FEATURES.map((feature) => (
                <div key={feature.key} className="flex flex-col items-center gap-1 text-center">
                  <feature.icon className="size-5 text-primary" aria-hidden />
                  <span className="text-[11px] font-medium text-muted-foreground whitespace-nowrap">
                    {t(feature.key)}
                  </span>
                </div>
              ))}

              <div className="ml-auto max-w-[220px] shrink-0 rounded-[var(--radius)] bg-card/80 px-3 py-2.5">
                <p className="text-xs font-semibold text-primary-dark italic">&ldquo;{t('heroQuote')}&rdquo;</p>
                <Link
                  href="/"
                  className="mt-2 inline-flex items-center gap-1 rounded-full bg-primary px-3 py-1.5 text-[11px] font-bold text-primary-foreground"
                >
                  {t('viewStore')}
                  <ArrowRight className="size-3" aria-hidden />
                </Link>
              </div>
            </div>
          </div>

          {/* Decorative handwritten-style tagline, matching the reference —
              always visible now (session 2026-09-21, new client reference:
              "same design on mobile and desktop", not hidden below `sm:`
              any more), just sized down so it and the photo still fit next
              to the greeting on a narrow phone. */}
          <p
            aria-hidden
            className="relative z-10 block shrink-0 -rotate-3 text-right font-serif text-[10px] leading-tight text-primary-dark/60 italic whitespace-pre-line sm:text-sm"
          >
            {t('welcomeTagline')}
          </p>

          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={HERO_IMAGE}
            alt=""
            aria-hidden
            className="relative z-10 h-14 w-auto shrink-0 rounded-xl object-contain shadow-md sm:h-20 sm:rounded-2xl md:h-28"
          />
        </div>
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
