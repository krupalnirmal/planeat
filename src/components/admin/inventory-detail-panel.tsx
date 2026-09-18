'use client';

import { useQuery } from '@tanstack/react-query';
import { Clock, Package } from 'lucide-react';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { api, qs } from '@/lib/api/client';
import { formatPaise, paise } from '@/lib/money';
import { cn } from '@/lib/utils';

/** Dashboard v2's Inventory tab detail panel (session 2026-09-19, Part N) —
    current stock/threshold/price plus the real stock-movement history from
    `AuditLog` (written by `bulkUpdateStock` on every edit, never read back
    before this). Editing itself stays on the full `/admin/inventory`
    page's bulk-edit table — this panel is read-only, matching the
    reference's own right-panel spirit (a detail view, not a second editor). */

interface VariantDetail {
  variantId: string;
  productName: string;
  label: string;
  quantity: number;
  unit: string;
  stockQty: number;
  lowStockThreshold: number;
  pricePaise: string;
  isActive: boolean;
  isLow: boolean;
  isOut: boolean;
}

interface StockHistoryEntry {
  id: string;
  action: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  actorName: string | null;
  createdAt: string;
}

const TRACKED_FIELDS = ['stockQty', 'lowStockThreshold', 'pricePaise', 'isActive'] as const;

/** Maps each tracked field to the label key `admin.inventory` already has
    for it (`stock`/`threshold`/`price`/`active`), rather than adding
    duplicate keys named after the raw field. */
const FIELD_LABEL_KEY: Record<(typeof TRACKED_FIELDS)[number], string> = {
  stockQty: 'stock',
  lowStockThreshold: 'threshold',
  pricePaise: 'price',
  isActive: 'active',
};

function formatFieldValue(field: string, value: unknown): string {
  if (value === undefined || value === null) return '—';
  if (field === 'pricePaise') return formatPaise(paise(String(value)), { hidePaise: true });
  if (field === 'isActive') return value ? '✓' : '✗';
  return String(value);
}

export function InventoryDetailPanel({ variantId }: { variantId: string }) {
  const t = useTranslations('admin.inventory');
  const te = useTranslations('admin.explorer');
  const tc = useTranslations('admin.common');
  const locale = useLocale();
  const format = useFormatter();

  const detail = useQuery({
    queryKey: ['admin-variant-detail', variantId, locale],
    queryFn: () =>
      api.get<{ variant: VariantDetail; history: StockHistoryEntry[] }>(
        `/api/admin/inventory/${variantId}${qs({ locale })}`,
      ),
  });

  if (detail.isLoading) {
    return <p className="p-4 text-sm text-muted-foreground">{tc('loading')}</p>;
  }

  const data = detail.data;
  if (!data) {
    return <p className="p-4 text-sm text-muted-foreground">{tc('empty')}</p>;
  }

  const { variant, history } = data;

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-full bg-tint-green text-primary">
            <Package className="size-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-base font-bold">{variant.productName}</h2>
            <p className="text-xs text-muted-foreground">{variant.label}</p>
          </div>
        </div>
        <Link href="/admin/inventory" className="shrink-0 text-xs font-semibold text-primary">
          {te('viewDetails')}
        </Link>
      </div>

      <div className="card-3d grid grid-cols-3 gap-2 rounded-[var(--radius)] border border-border/60 bg-card p-4">
        <div>
          <p className="text-xs text-muted-foreground">{t('stock')}</p>
          <p
            className={cn(
              'text-lg font-bold tabular-nums',
              variant.isOut ? 'text-danger' : variant.isLow ? 'text-warning' : 'text-foreground',
            )}
          >
            {variant.stockQty}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{t('threshold')}</p>
          <p className="text-lg font-bold tabular-nums">{variant.lowStockThreshold}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{t('price')}</p>
          <p className="text-lg font-bold tabular-nums">
            {formatPaise(paise(variant.pricePaise), { hidePaise: true })}
          </p>
        </div>
      </div>

      <div>
        <h3 className="mb-2 flex items-center gap-1.5 text-sm font-bold">
          <Clock className="size-3.5 text-muted-foreground" aria-hidden />
          {t('stockHistory')}
        </h3>
        {history.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t('noStockHistory')}</p>
        ) : (
          <ul className="card-3d divide-y divide-border overflow-hidden rounded-[var(--radius)] border border-border/60 bg-card">
            {history.map((entry) => {
              // `audit()` serialises `undefined` fields (the ones NOT part
              // of that particular update — `bulkUpdateStock` always sends
              // the full field set, just with the untouched ones left
              // `undefined`) to `null` before writing the JSON column, so
              // `null` here means "not part of this edit", not "cleared".
              // None of these four fields can legitimately hold a real
              // `null`, so filtering on `!= null` (not `!== undefined`,
              // which the JSON round-trip already erased) is what actually
              // isolates the field that changed.
              const changedFields = TRACKED_FIELDS.filter(
                (field) => entry.after && entry.after[field] != null,
              );
              return (
                <li key={entry.id} className="px-3 py-2.5">
                  <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span>{entry.actorName ?? '—'}</span>
                    <span>
                      {format.dateTime(new Date(entry.createdAt), {
                        day: 'numeric',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                  {changedFields.length > 0 && (
                    <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
                      {changedFields.map((field) => (
                        <li key={field}>
                          <span className="text-muted-foreground">{t(FIELD_LABEL_KEY[field])}: </span>
                          <span className="font-medium">
                            {formatFieldValue(field, entry.before?.[field])} →{' '}
                            {formatFieldValue(field, entry.after?.[field])}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
