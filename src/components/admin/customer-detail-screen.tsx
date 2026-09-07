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
 * (already existed, already assembled everything but the meal plan) and the
 * customer-facing meal-plan screen's own read-only summary layout
 * (`src/components/meal-plan/plan-table.tsx`'s `builder.summaryTitle` block)
 * rather than inventing a new one.
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
          <h2 className="mb-2 text-sm font-bold">{t('walletBalance')}</h2>
          <p className="text-xl font-bold">{formatPaise(paise(customer.walletBalancePaise))}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {t('joined')}:{' '}
            {format.dateTime(new Date(customer.createdAt), { day: 'numeric', month: 'short', year: 'numeric' })}
          </p>
        </section>

        <section className="rounded-[var(--radius)] border border-border bg-card p-4">
          <h2 className="mb-2 text-sm font-bold">{t('addresses')}</h2>
          {customer.addresses.length === 0 ? (
            <p className="text-xs text-muted-foreground">{tc('empty')}</p>
          ) : (
            <ul className="space-y-1.5 text-xs">
              {customer.addresses.map((address) => (
                <li key={address.id}>
                  <span className="font-medium">{address.label}</span>
                  {address.isDefault && ' ★'} — {address.line1}, {address.city} {address.pincode}
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* ── My Meal Plan — the new section this page exists for. */}
        <section className="rounded-[var(--radius)] border border-border bg-card p-4 lg:col-span-2">
          <h2 className="mb-2 flex items-center gap-2 text-sm font-bold">
            <ClipboardList className="size-4 text-primary" aria-hidden />
            {tPlan('title')}
          </h2>
          {!customer.mealPlan || customer.mealPlan.days.every((day) => day.items.length === 0) ? (
            <p className="text-xs text-muted-foreground">{t('noMealPlan')}</p>
          ) : (
            <ul className="divide-y divide-border/60">
              {customer.mealPlan.days
                .filter((day) => day.items.length > 0)
                .map((day) => {
                  const isToday = day.dayOfWeek === today;
                  const names = day.items.map((item) => `${item.name} (${item.variantLabel})`).join(', ');
                  return (
                    <li key={day.dayOfWeek} className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
                      <span
                        className={cn(
                          'mt-0.5 shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold',
                          isToday ? 'bg-primary text-primary-foreground' : 'bg-tint-green text-primary-dark',
                        )}
                      >
                        {tPlan(`daysShort.${day.dayOfWeek}`)}
                        {isToday && ` · ${t('today')}`}
                      </span>
                      <p className="text-xs leading-relaxed">{names}</p>
                    </li>
                  );
                })}
            </ul>
          )}
        </section>

        <section className="rounded-[var(--radius)] border border-border bg-card p-4">
          <h2 className="mb-2 text-sm font-bold">{t('subscriptions')}</h2>
          {customer.subscriptions.length === 0 ? (
            <p className="text-xs text-muted-foreground">{tc('empty')}</p>
          ) : (
            <ul className="space-y-1.5 text-xs">
              {customer.subscriptions.map((sub) => (
                <li key={sub.id} className="flex justify-between">
                  <span>{sub.status}</span>
                  <span className="text-muted-foreground">
                    {format.dateTime(new Date(sub.startDate), { day: 'numeric', month: 'short' })} –{' '}
                    {format.dateTime(new Date(sub.endDate), { day: 'numeric', month: 'short' })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-[var(--radius)] border border-border bg-card p-4">
          <h2 className="mb-2 text-sm font-bold">{t('recentOrders')}</h2>
          {customer.recentOrders.length === 0 ? (
            <p className="text-xs text-muted-foreground">{tc('empty')}</p>
          ) : (
            <ul className="space-y-1.5 text-xs">
              {customer.recentOrders.map((order) => (
                <li key={order.id} className="flex justify-between">
                  <span className="font-mono">{order.orderNumber}</span>
                  <span className="text-muted-foreground">
                    {tStatus(order.status as never)} · {formatPaise(paise(order.totalPaise), { hidePaise: true })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
