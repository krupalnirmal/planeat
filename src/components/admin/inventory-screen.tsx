'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Save } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { AdminPageHeader, AdminTable } from '@/components/admin/admin-shell';
import { api, qs } from '@/lib/api/client';
import { formatPaise, paise, rupeesToPaise } from '@/lib/money';
import { cn } from '@/lib/utils';

/**
 * M9 — Inventory: stock levels, thresholds, bulk update, mark unavailable.
 *
 * Edits are held locally and saved in one batch. The owner counting a shelf
 * types twelve numbers in a row, and a request per keystroke would be twelve
 * round trips to Singapore plus twelve chances to half-apply — which is
 * exactly the state that makes tomorrow's 00:30 substitution decisions wrong.
 */

interface InventoryRow {
  variantId: string;
  productName: string;
  label: string;
  stockQty: number;
  lowStockThreshold: number;
  pricePaise: string;
  isActive: boolean;
  isLow: boolean;
  isOut: boolean;
}

interface Draft {
  stockQty?: number;
  lowStockThreshold?: number;
  pricePaise?: number;
  isActive?: boolean;
}

export function AdminInventoryScreen() {
  const t = useTranslations('admin.inventory');
  const tc = useTranslations('admin.common');
  const locale = useLocale();
  const queryClient = useQueryClient();

  const [filter, setFilter] = useState<'all' | 'low' | 'out'>('all');
  const [query, setQuery] = useState('');
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [notice, setNotice] = useState<string | null>(null);

  const inventory = useQuery({
    queryKey: ['admin-inventory', filter, query, locale],
    queryFn: () =>
      api.get<{ rows: InventoryRow[] }>(
        `/api/admin/inventory${qs({
          locale,
          query: query || undefined,
          onlyLow: filter === 'low' ? 'true' : undefined,
          onlyOut: filter === 'out' ? 'true' : undefined,
          perPage: 50,
        })}`,
      ),
  });

  const save = useMutation({
    mutationFn: () =>
      api.patch<{ updated: number }>('/api/admin/inventory', {
        updates: Object.entries(drafts).map(([variantId, draft]) => ({ variantId, ...draft })),
      }),
    onSuccess: (data) => {
      setNotice(t('saved', { count: data.updated }));
      setDrafts({});
      void queryClient.invalidateQueries({ queryKey: ['admin-inventory'] });
      void queryClient.invalidateQueries({ queryKey: ['admin-dashboard'] });
    },
    onError: () => setNotice(tc('failed')),
  });

  function setDraft(variantId: string, change: Draft) {
    setDrafts((current) => ({ ...current, [variantId]: { ...current[variantId], ...change } }));
  }

  const dirtyCount = Object.keys(drafts).length;
  const rows = inventory.data?.rows ?? [];

  return (
    <>
      <AdminPageHeader
        title={t('title')}
        action={
          <button
            type="button"
            onClick={() => save.mutate()}
            disabled={dirtyCount === 0 || save.isPending}
            className="flex h-10 items-center gap-1.5 rounded-[var(--radius)] bg-primary px-3 text-xs font-bold text-primary-foreground disabled:opacity-50"
          >
            {save.isPending ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
            ) : (
              <Save className="size-3.5" aria-hidden />
            )}
            {t('save')}
            {dirtyCount > 0 && ` (${dirtyCount})`}
          </button>
        }
      />

      {notice && (
        <p className="mb-4 rounded-[var(--radius)] bg-primary/5 px-4 py-3 text-sm">{notice}</p>
      )}

      <div className="mb-3 flex flex-wrap gap-2">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={tc('search')}
          className="h-10 min-w-48 flex-1 rounded-[var(--radius)] border border-border bg-card px-3 text-sm outline-none"
        />
        {(
          [
            ['all', tc('search')],
            ['low', t('filterLow')],
            ['out', t('filterOut')],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setFilter(value)}
            className={cn(
              'h-10 rounded-[var(--radius)] px-3 text-xs font-medium',
              filter === value
                ? 'bg-primary text-primary-foreground font-semibold'
                : 'border border-border bg-card text-muted-foreground',
            )}
          >
            {value === 'all' ? tc('actions') : label}
          </button>
        ))}
      </div>

      {inventory.isLoading ? (
        <p className="text-sm text-muted-foreground">{tc('loading')}</p>
      ) : rows.length === 0 ? (
        <p className="rounded-[var(--radius)] border border-dashed border-border bg-card px-4 py-10 text-center text-sm text-muted-foreground">
          {tc('empty')}
        </p>
      ) : (
        <AdminTable>
          <thead className="border-b border-border bg-secondary/60 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">{t('product')}</th>
              <th className="px-3 py-2 font-medium">{t('variant')}</th>
              <th className="px-3 py-2 text-right font-medium">{t('stock')}</th>
              <th className="px-3 py-2 text-right font-medium">{t('threshold')}</th>
              <th className="px-3 py-2 text-right font-medium">{t('price')}</th>
              <th className="px-3 py-2 text-center font-medium">{t('active')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const draft = drafts[row.variantId] ?? {};
              const dirty = Object.keys(draft).length > 0;

              return (
                <tr
                  key={row.variantId}
                  className={cn(
                    'border-b border-border last:border-0',
                    dirty && 'bg-primary/5',
                  )}
                >
                  <td className="px-3 py-2 font-medium">
                    {row.productName}
                    {row.isOut ? (
                      <span className="ml-2 rounded-full bg-danger/10 px-2 py-0.5 text-[10px] font-bold text-danger">
                        {t('outBadge')}
                      </span>
                    ) : row.isLow ? (
                      <span className="ml-2 rounded-full bg-[#FDF3E3] px-2 py-0.5 text-[10px] font-bold text-warning">
                        {t('lowBadge')}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{row.label}</td>
                  <td className="px-3 py-2 text-right">
                    <input
                      type="number"
                      min={0}
                      value={draft.stockQty ?? row.stockQty}
                      onChange={(event) =>
                        setDraft(row.variantId, { stockQty: Number(event.target.value) })
                      }
                      className="h-9 w-20 rounded border border-border bg-background px-2 text-right text-sm tabular-nums outline-none"
                    />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <input
                      type="number"
                      min={0}
                      value={draft.lowStockThreshold ?? row.lowStockThreshold}
                      onChange={(event) =>
                        setDraft(row.variantId, {
                          lowStockThreshold: Number(event.target.value),
                        })
                      }
                      className="h-9 w-16 rounded border border-border bg-background px-2 text-right text-sm tabular-nums outline-none"
                    />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <input
                      inputMode="decimal"
                      defaultValue={formatPaise(paise(row.pricePaise), { withSymbol: false })}
                      onChange={(event) => {
                        const value = event.target.value.replace(/[^\d.]/g, '');
                        if (value)
                          setDraft(row.variantId, { pricePaise: Number(rupeesToPaise(value)) });
                      }}
                      className="h-9 w-24 rounded border border-border bg-background px-2 text-right text-sm tabular-nums outline-none"
                    />
                  </td>
                  <td className="px-3 py-2 text-center">
                    <input
                      type="checkbox"
                      checked={draft.isActive ?? row.isActive}
                      onChange={(event) =>
                        setDraft(row.variantId, { isActive: event.target.checked })
                      }
                      className="size-4 accent-[var(--primary)]"
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </AdminTable>
      )}
    </>
  );
}
