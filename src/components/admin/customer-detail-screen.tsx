'use client';

import { useQuery } from '@tanstack/react-query';
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Leaf,
  MapPin,
  ShoppingCart,
  UtensilsCrossed,
  Wallet,
} from 'lucide-react';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { api, qs } from '@/lib/api/client';
import { formatPaise, paise } from '@/lib/money';
import { cn } from '@/lib/utils';

/**
 * M9 — a customer's profile, orders, wallet, subscriptions, and their saved
 * "My Meal Plan" — the detail page `AdminCustomersScreen`'s list never had
 * anywhere to link to before this. Reuses `GET /api/admin/customers/:id`
 * (already existed, already assembled everything but the meal plan).
 *
 * Redesigned (session 2026-09-09, client reference) from the earlier plain
 * bordered-card layout to a colour-coded one — a section is identified by
 * its icon circle before its label is even read, matching how the
 * storefront's own home page (`HeroBanner`) and card language already work,
 * just applied to a data-dense admin screen instead of a marketing one.
 * Every colour used is an existing token (`--primary`, `--accent`,
 * `--warning`, `--danger`, `--brand-tint-*`) — no new hex values.
 *
 * Not S6-gated: the meal plan is a saved shopping list, not health data (see
 * `src/lib/meal-plan/queries.ts`'s own docs) — unlike the health profile,
 * which stays a separate, logged, Super-Admin-only call this screen
 * deliberately does not make.
 */

interface CustomerDetail {
  id: string;
  name: string | null;
  phone: string;
  email: string | null;
  role: string;
  isActive: boolean;
  createdAt: string;
  walletBalancePaise: string;
  addresses: Array<{ id: string; label: string; line1: string; city: string; pincode: string; isDefault: boolean }>;
  recentOrders: Array<{ id: string; orderNumber: string; status: string; totalPaise: string; placedAt: string }>;
  subscriptions: Array<{ id: string; status: string; startDate: string; endDate: string }>;
  hasHealthProfile: boolean;
  mealPlan: { id: string; days: Array<{ dayOfWeek: number; items: Array<{ name: string; variantLabel: string }> }> } | null;
}

/** IST day-of-week (1 = Monday … 7 = Sunday) — same UTC+5:30 shift as
    `istNow`/`istDateKey` (`src/lib/cron.ts`), reimplemented here rather than
    imported since that module pulls in `@/lib/env`, which is server-only. */
function todayDayOfWeek(): number {
  const shifted = new Date(Date.now() + 5.5 * 3_600_000);
  const day = shifted.getUTCDay(); // 0 = Sunday … 6 = Saturday
  return day === 0 ? 7 : day;
}

/** Solid dot colours for the recent-orders list — same statuses
    `STATUS_TONE` (orders-screen.tsx) covers, reduced to one colour each
    rather than that map's background+text pairs, which read as pills, not
    list-row dots. */
const STATUS_DOT: Record<string, string> = {
  PLACED: 'bg-muted-foreground',
  CONFIRMED: 'bg-primary',
  PACKED: 'bg-primary',
  OUT_FOR_DELIVERY: 'bg-warning',
  DELIVERED: 'bg-success',
  CANCELLED: 'bg-danger',
  FAILED_DELIVERY: 'bg-danger',
  REFUNDED: 'bg-muted-foreground',
  PAYMENT_PENDING: 'bg-warning',
};

function IconCircle({
  icon: Icon,
  className,
}: {
  icon: typeof Wallet;
  className?: string;
}) {
  return (
    <span className={cn('grid size-9 shrink-0 place-items-center rounded-full', className)}>
      <Icon className="size-4.5" aria-hidden />
    </span>
  );
}

export function CustomerDetailScreen({ customerId }: { customerId: string }) {
  const t = useTranslations('admin.customers');
  const tc = useTranslations('admin.common');
  const tPlan = useTranslations('mealPlan');
  const tStatus = useTranslations('orders.status');
  const locale = useLocale();
  const format = useFormatter();

  const detail = useQuery({
    queryKey: ['admin-customer', customerId, locale],
    queryFn: () => api.get<{ customer: CustomerDetail }>(`/api/admin/customers/${customerId}${qs({ locale })}`),
  });

  if (detail.isLoading) {
    return <p className="text-sm text-muted-foreground">{tc('loading')}</p>;
  }

  const customer = detail.data?.customer;
  if (!customer) {
    return <p className="text-sm text-muted-foreground">{tc('empty')}</p>;
  }

  const today = todayDayOfWeek();

  return (
    <div className="space-y-4">
      {/* Hero banner — replaces the plain AdminPageHeader text-only look for
          just this page. The back chevron sits inside it rather than in a
          separate header row above, so there's one identity block instead
          of two stacked ones. */}
      <div className="relative overflow-hidden rounded-[var(--radius-2xl)] bg-gradient-to-br from-tint-green via-tint-green to-tint-yellow px-5 py-5">
        <Leaf
          aria-hidden
          className="pointer-events-none absolute -top-4 -right-6 size-24 rotate-12 text-primary/10"
        />
        <Leaf
          aria-hidden
          className="pointer-events-none absolute -bottom-6 left-1/3 size-16 -rotate-12 text-primary/10"
        />
        <Link
          href="/admin/customers"
          aria-label={tc('back')}
          className="relative z-10 mb-3 inline-grid size-8 place-items-center rounded-full bg-card/70 text-primary-dark hover:bg-card"
        >
          <ChevronLeft className="size-4.5" aria-hidden />
        </Link>
        <div className="relative z-10 flex items-center gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-full bg-card text-primary">
            <Leaf className="size-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-xl font-black text-primary-dark">{customer.name ?? customer.phone}</h1>
            <p className="text-sm text-muted-foreground">{customer.phone}</p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-[var(--radius-2xl)] bg-tint-green p-4">
          <div className="mb-3 flex items-center gap-2.5">
            <IconCircle icon={Wallet} className="bg-card text-primary" />
            <h2 className="text-sm font-bold text-primary-dark">{t('walletBalance')}</h2>
          </div>
          <p className="text-2xl font-black">{formatPaise(paise(customer.walletBalancePaise))}</p>
          <p className="mt-1.5 text-xs text-muted-foreground">
            {t('joined')}{' '}
            {format.dateTime(new Date(customer.createdAt), { day: 'numeric', month: 'short', year: 'numeric' })}
          </p>
        </section>

        <section className="rounded-[var(--radius-2xl)] bg-tint-yellow p-4">
          <div className="mb-3 flex items-center gap-2.5">
            <IconCircle icon={MapPin} className="bg-card text-warning" />
            <h2 className="text-sm font-bold text-[#8A5A2B]">{t('addresses')}</h2>
          </div>
          {customer.addresses.length === 0 ? (
            <p className="text-sm text-muted-foreground">{tc('empty')}</p>
          ) : (
            <ul className="space-y-2.5">
              {customer.addresses.map((address) => (
                <li key={address.id} className="text-sm">
                  <span className="font-semibold">{address.label}</span>
                  {address.isDefault && <span className="ml-1 text-primary">★</span>}
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {address.line1}, {address.city} {address.pincode}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* ── My Meal Plan — the section this page exists for. Each item is
            its own chip, not a comma-glued sentence — a day with six or
            seven picks used to read as one dense run-on line. */}
        <section className="rounded-[var(--radius-2xl)] border border-border bg-card p-4 lg:col-span-2">
          <div className="mb-3 flex items-center gap-2.5">
            <IconCircle icon={UtensilsCrossed} className="bg-tint-green text-primary" />
            <h2 className="text-sm font-bold">{tPlan('title')}</h2>
          </div>
          {!customer.mealPlan || customer.mealPlan.days.every((day) => day.items.length === 0) ? (
            <p className="text-sm text-muted-foreground">{t('noMealPlan')}</p>
          ) : (
            <ul className="space-y-3">
              {customer.mealPlan.days
                .filter((day) => day.items.length > 0)
                .map((day) => {
                  const isToday = day.dayOfWeek === today;
                  return (
                    <li
                      key={day.dayOfWeek}
                      className={cn(
                        'rounded-[var(--radius)] p-2.5',
                        isToday ? 'bg-tint-green' : 'bg-secondary/40',
                      )}
                    >
                      <div className="mb-1.5 flex items-center gap-2">
                        <span
                          className={cn(
                            'rounded-full px-2.5 py-0.5 text-[11px] font-bold',
                            isToday ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground',
                          )}
                        >
                          {tPlan(`days.${day.dayOfWeek}`)}
                        </span>
                        {isToday && <span className="text-[11px] font-bold text-primary-dark">· {t('today')}</span>}
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {day.items.map((item, index) => (
                          <span
                            key={`${item.name}-${index}`}
                            className="rounded-full border border-border bg-card px-2.5 py-1 text-xs font-medium"
                          >
                            {item.name} <span className="text-muted-foreground">({item.variantLabel})</span>
                          </span>
                        ))}
                      </div>
                    </li>
                  );
                })}
            </ul>
          )}
        </section>

        <section className="rounded-[var(--radius-2xl)] border border-border bg-card p-4">
          <div className="mb-3 flex items-center gap-2.5">
            <IconCircle icon={Calendar} className="bg-secondary text-muted-foreground" />
            <h2 className="text-sm font-bold">{t('subscriptions')}</h2>
          </div>
          {customer.subscriptions.length === 0 ? (
            <div className="flex flex-col items-center gap-1.5 py-6 text-center">
              <Calendar className="size-8 text-muted-foreground/30" aria-hidden />
              <p className="text-sm text-muted-foreground">{tc('empty')}</p>
            </div>
          ) : (
            <ul className="space-y-2.5">
              {customer.subscriptions.map((sub) => (
                <li key={sub.id} className="flex items-center justify-between text-sm">
                  <span className="font-medium">{sub.status}</span>
                  <span className="text-xs text-muted-foreground">
                    {format.dateTime(new Date(sub.startDate), { day: 'numeric', month: 'short' })} –{' '}
                    {format.dateTime(new Date(sub.endDate), { day: 'numeric', month: 'short' })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-[var(--radius-2xl)] border border-border bg-card p-4">
          <div className="mb-3 flex items-center gap-2.5">
            <IconCircle icon={ShoppingCart} className="bg-danger/10 text-danger" />
            <h2 className="text-sm font-bold">{t('recentOrders')}</h2>
          </div>
          {customer.recentOrders.length === 0 ? (
            <p className="text-sm text-muted-foreground">{tc('empty')}</p>
          ) : (
            <ul className="divide-y divide-border/60">
              {customer.recentOrders.map((order) => (
                <li key={order.id}>
                  <Link
                    href={`/admin/orders/${order.id}`}
                    className="flex items-center gap-2 py-2.5 first:pt-0 last:pb-0 hover:opacity-80"
                  >
                    <span
                      className={cn('size-2 shrink-0 rounded-full', STATUS_DOT[order.status] ?? 'bg-muted-foreground')}
                      aria-hidden
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-mono text-xs font-medium">{order.orderNumber}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{tStatus(order.status as never)}</p>
                    </div>
                    <p className="shrink-0 text-sm font-semibold">
                      {formatPaise(paise(order.totalPaise), { hidePaise: true })}
                    </p>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
