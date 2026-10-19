'use client';

import { useQuery } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { ShoppingBasket } from 'lucide-react';
import { api, qs } from '@/lib/api/client';

/**
 * Tomorrow's procurement forecast (session 2026-10-19, client request) — how
 * much of each vegetable this vendor needs to have on hand for tomorrow's
 * meal-plan deliveries, aggregated across every subscription this vendor is
 * nearest to. Read-only estimate: `src/lib/vendor/forecast.ts`'s own doc
 * comment explains why it can drift from the real order (out-of-stock
 * substitution at generation time, a last-minute skip, etc).
 */

interface RequirementLine {
  productId: string;
  name: string;
  displayQuantity: string;
  subscriptionCount: number;
}

export function VendorRequirementPanel() {
  const t = useTranslations('vendor.requirement');
  const tc = useTranslations('common');
  const locale = useLocale();

  const forecast = useQuery({
    queryKey: ['vendor-forecast', locale],
    queryFn: () => api.get<{ lines: RequirementLine[] }>(`/api/vendor/forecast${qs({ locale })}`),
    refetchInterval: 5 * 60_000,
  });

  const rows = forecast.data?.lines ?? [];

  if (forecast.isLoading) {
    return <p className="text-sm text-muted-foreground">{tc('loading')}</p>;
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">{t('hint')}</p>

      {rows.length === 0 ? (
        <p className="rounded-[var(--radius)] border border-dashed border-border bg-card px-4 py-10 text-center text-sm text-muted-foreground">
          {t('empty')}
        </p>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-[var(--radius)] border border-border bg-card">
          {rows.map((line) => (
            <li key={line.productId} className="flex items-center gap-3 px-3 py-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-secondary">
                <ShoppingBasket className="size-4 text-muted-foreground" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{line.name}</span>
                <span className="block text-xs text-muted-foreground">
                  {t('forCustomers', { count: line.subscriptionCount })}
                </span>
              </span>
              <span className="shrink-0 text-sm font-black tabular-nums">{line.displayQuantity}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
