'use client';

import { useQuery } from '@tanstack/react-query';
import { Calendar, User } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { SubscriptionRiderControl } from '@/components/admin/customer-detail-screen';
import { STATUS_TONE } from '@/components/admin/meal-plans-screen';
import { api } from '@/lib/api/client';
import { cn } from '@/lib/utils';

/** Dashboard v2's Plans tab detail panel (session 2026-09-18, Part M) — a
    real per-subscription detail view, which didn't exist before this (each
    row on the Plans list previously just linked out to the whole customer
    page). Fetches the customer via the same `GET /api/admin/customers/:id`
    the full customer detail page already uses (it already returns
    `subscriptions[]`) and picks out the one being viewed, rather than a
    new query — the day-by-day plan contents stay on the customer page
    (`CustomerPlanView`) since that's genuinely customer-level, not
    subscription-level, data; this panel focuses on what IS
    subscription-level: status, period, and the standing rider. */

interface CustomerForPlan {
  id: string;
  name: string | null;
  phone: string;
  subscriptions: Array<{
    id: string;
    status: string;
    startDate: string;
    endDate: string;
    assignedPartnerId: string | null;
    assignedPartnerName: string | null;
  }>;
}

export function SubscriptionDetailPanel({
  subscriptionId,
  customerId,
}: {
  subscriptionId: string;
  customerId: string;
}) {
  const te = useTranslations('admin.explorer');
  const tc = useTranslations('admin.common');
  const tStatus = useTranslations('admin.mealPlans.status');
  const format = useFormatter();

  const detail = useQuery({
    queryKey: ['admin-customer', customerId, 'mr'],
    queryFn: () => api.get<{ customer: CustomerForPlan }>(`/api/admin/customers/${customerId}`),
  });

  if (detail.isLoading) {
    return <p className="p-4 text-sm text-muted-foreground">{tc('loading')}</p>;
  }

  const customer = detail.data?.customer;
  const subscription = customer?.subscriptions.find((sub) => sub.id === subscriptionId);
  if (!customer || !subscription) {
    return <p className="p-4 text-sm text-muted-foreground">{tc('empty')}</p>;
  }

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-full bg-tint-green text-primary">
            <User className="size-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-base font-bold">{customer.name ?? customer.phone}</h2>
            <p className="text-xs text-muted-foreground">{customer.phone}</p>
          </div>
        </div>
        <Link href={`/admin/customers/${customerId}`} className="shrink-0 text-xs font-semibold text-primary">
          {te('viewProfile')}
        </Link>
      </div>

      <div className="card-3d rounded-[var(--radius)] border border-border/60 bg-card p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <span
            className={cn('rounded-full px-2.5 py-1 text-xs font-semibold', STATUS_TONE[subscription.status])}
          >
            {tStatus(subscription.status)}
          </span>
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Calendar className="size-3.5" aria-hidden />
            {format.dateTime(new Date(subscription.startDate), { day: 'numeric', month: 'short' })} –{' '}
            {format.dateTime(new Date(subscription.endDate), {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            })}
          </span>
        </div>

        {subscription.status === 'ACTIVE' && (
          <SubscriptionRiderControl
            subscriptionId={subscription.id}
            assignedPartnerId={subscription.assignedPartnerId}
            assignedPartnerName={subscription.assignedPartnerName}
          />
        )}
      </div>
    </div>
  );
}
