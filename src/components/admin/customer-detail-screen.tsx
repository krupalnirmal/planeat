'use client';

import { useQuery } from '@tanstack/react-query';
import { ClipboardList } from 'lucide-react';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { AdminPageHeader } from '@/components/admin/admin-shell';
import { api, qs } from '@/lib/api/client';
import { formatPaise, paise } from '@/lib/money';
import { cn } from '@/lib/utils';

/**
 * M9 — a customer's profile, orders, wallet, subscriptions, and (new) their
 * saved "My Meal Plan" — the detail page `AdminCustomersScreen`'s list never
 * had anywhere to link to before this. Reuses `GET /api/admin/customers/:id`
 * (already existed, already assembled everything but the meal plan).
 *
 * The meal plan's first pass (session 2026-09-08) borrowed the customer
 * screen's comma-joined-sentence summary row — fine for the customer's own
 * short weekly recap, unreadable here once a day had six or seven picks in
 * one run-on line. Each item is its own chip instead, one day per card.
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
    return (
      <>
        <AdminPageHeader title={t('title')} backHref="/admin/customers" backLabel={tc('back')} />
        <p className="text-sm text-muted-foreground">{tc('loading')}</p>
      </>
    );
  }

  const customer = detail.data?.customer;
  if (!customer) {
    return (
      <>
        <AdminPageHeader title={t('title')} backHref="/admin/customers" backLabel={tc('back')} />
        <p className="text-sm text-muted-foreground">{tc('empty')}</p>
      </>
    );
  }

  const today = todayDayOfWeek();

  return (
    <>
      <AdminPageHeader
        title={customer.name ?? customer.phone}
        subtitle={customer.phone}
        backHref="/admin/customers"
        backLabel={tc('back')}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-[var(--radius)] border border-border bg-card p-4">
          <h2 className="mb-2 text-sm font-bold text-muted-foreground">{t('walletBalance')}</h2>
          <p className="text-2xl font-bold">{formatPaise(paise(customer.walletBalancePaise))}</p>
          <p className="mt-1.5 text-xs text-muted-foreground">
            {t('joined')}{' '}
            {format.dateTime(new Date(customer.createdAt), { day: 'numeric', month: 'short', year: 'numeric' })}
          </p>
        </section>

        <section className="rounded-[var(--radius)] border border-border bg-card p-4">
          <h2 className="mb-2 text-sm font-bold text-muted-foreground">{t('addresses')}</h2>
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

        {/* ── My Meal Plan — the new section this page exists for. Each
            item is its own chip, not a comma-glued sentence — a day with
            six or seven picks used to read as one dense run-on line. */}
        <section className="rounded-[var(--radius)] border border-border bg-card p-4 lg:col-span-2">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-bold">
            <ClipboardList className="size-4 text-primary" aria-hidden />
            {tPlan('title')}
          </h2>
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
                        {isToday && <span className="text-[11px] font-bold text-primary-dark">{t('today')}</span>}
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

        <section className="rounded-[var(--radius)] border border-border bg-card p-4">
          <h2 className="mb-2 text-sm font-bold text-muted-foreground">{t('subscriptions')}</h2>
          {customer.subscriptions.length === 0 ? (
            <p className="text-sm text-muted-foreground">{tc('empty')}</p>
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

        <section className="rounded-[var(--radius)] border border-border bg-card p-4">
          <h2 className="mb-2 text-sm font-bold text-muted-foreground">{t('recentOrders')}</h2>
          {customer.recentOrders.length === 0 ? (
            <p className="text-sm text-muted-foreground">{tc('empty')}</p>
          ) : (
            <ul className="divide-y divide-border/60">
              {customer.recentOrders.map((order) => (
                <li key={order.id} className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="truncate font-mono text-xs font-medium">{order.orderNumber}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {format.dateTime(new Date(order.placedAt), { day: 'numeric', month: 'short' })}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-semibold">{formatPaise(paise(order.totalPaise), { hidePaise: true })}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{tStatus(order.status as never)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
