'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Stethoscope } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import { AdminPageHeader, AdminTable } from '@/components/admin/admin-shell';
import { api, qs } from '@/lib/api/client';
import { cn } from '@/lib/utils';

/**
 * M9 — Meal plans, and B8's flagged review queue.
 *
 * The queue is the second layer under the customer's doctor banner. Marking a
 * plan reviewed does NOT unflag it — the condition that raised the flag has
 * not gone away, so the customer keeps their banner. What changes is that a
 * human has now looked, which is what the dashboard counts.
 *
 * `flagReason` appears here and nowhere the customer can see it (D-108).
 */

interface PlanRow {
  id: string;
  version: number;
  status: string;
  customerName: string;
  customerPhone: string;
  flaggedForReview: boolean;
  flagReason: string | null;
  reviewedAt: string | null;
  aiProvider: string | null;
  createdAt: string;
  hasSubscription: boolean;
}

export function AdminMealPlansScreen() {
  const t = useTranslations('admin.mealPlans');
  const tc = useTranslations('admin.common');
  const format = useFormatter();
  const queryClient = useQueryClient();

  const [unreviewedOnly, setUnreviewedOnly] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);

  const plans = useQuery({
    queryKey: ['admin-meal-plans', unreviewedOnly],
    queryFn: () =>
      api.get<{ plans: PlanRow[] }>(
        `/api/admin/meal-plans${qs({
          unreviewedOnly: unreviewedOnly ? 'true' : undefined,
          perPage: 50,
        })}`,
      ),
  });

  const review = useMutation({
    mutationFn: (planId: string) => api.post(`/api/admin/meal-plans/${planId}`, {}),
    onSuccess: () => {
      setNotice(t('reviewedDone'));
      void queryClient.invalidateQueries({ queryKey: ['admin-meal-plans'] });
      void queryClient.invalidateQueries({ queryKey: ['admin-dashboard'] });
    },
    onError: () => setNotice(tc('failed')),
  });

  const rows = plans.data?.plans ?? [];

  return (
    <>
      <AdminPageHeader
        title={t('title')}
        action={
          <label className="flex h-10 items-center gap-2 rounded-[var(--radius)] border border-border bg-card px-3 text-xs">
            <input
              type="checkbox"
              checked={unreviewedOnly}
              onChange={(event) => setUnreviewedOnly(event.target.checked)}
              className="size-4 accent-[var(--primary)]"
            />
            {t('unreviewedOnly')}
          </label>
        }
      />

      {notice && (
        <p className="mb-4 rounded-[var(--radius)] bg-primary/5 px-4 py-3 text-sm">{notice}</p>
      )}

      {plans.isLoading ? (
        <p className="text-sm text-muted-foreground">{tc('loading')}</p>
      ) : rows.length === 0 ? (
        <p className="rounded-[var(--radius)] border border-dashed border-border bg-card px-4 py-10 text-center text-sm text-muted-foreground">
          {tc('empty')}
        </p>
      ) : (
        <AdminTable>
          <thead className="border-b border-border bg-secondary/60 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">{t('customer')}</th>
              <th className="px-3 py-2 font-medium">{t('flagReason')}</th>
              <th className="px-3 py-2 font-medium">{t('generatedBy')}</th>
              <th className="px-3 py-2 font-medium">{tc('date')}</th>
              <th className="px-3 py-2 font-medium">{tc('actions')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((plan) => (
              <tr key={plan.id} className="border-b border-border last:border-0">
                <td className="px-3 py-2.5">
                  <span className="block font-medium">{plan.customerName}</span>
                  <span className="text-xs text-muted-foreground">
                    {plan.customerPhone} · v{plan.version}
                  </span>
                </td>

                <td className="px-3 py-2.5 text-xs">
                  {plan.flaggedForReview ? (
                    <span className="flex items-start gap-1.5 text-warning">
                      <Stethoscope className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                      {/* Admin-only clinical detail. */}
                      {plan.flagReason ?? t('flagged')}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>

                <td className="px-3 py-2.5 text-xs text-muted-foreground">
                  {plan.aiProvider ?? '—'}
                </td>

                <td className="px-3 py-2.5 text-xs text-muted-foreground">
                  {format.dateTime(new Date(plan.createdAt), {
                    day: 'numeric',
                    month: 'short',
                  })}
                </td>

                <td className="px-3 py-2.5">
                  {plan.reviewedAt ? (
                    <span className="text-xs font-semibold text-success">{t('reviewed')}</span>
                  ) : plan.flaggedForReview ? (
                    <button
                      type="button"
                      onClick={() => review.mutate(plan.id)}
                      disabled={review.isPending}
                      className={cn(
                        'flex h-9 items-center gap-1.5 rounded-[var(--radius)] border border-primary px-2.5 text-xs font-semibold text-primary',
                        review.isPending && 'opacity-50',
                      )}
                    >
                      {review.isPending && (
                        <Loader2 className="size-3 animate-spin" aria-hidden />
                      )}
                      {t('markReviewed')}
                    </button>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </AdminTable>
      )}
    </>
  );
}
