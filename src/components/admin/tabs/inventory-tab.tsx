'use client';

import { useQuery } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { ExplorerPagination, ExplorerSplit } from '@/components/admin/explorer';
import { InventoryDetailPanel } from '@/components/admin/inventory-detail-panel';
import { api, qs } from '@/lib/api/client';
import { formatPaise, paise } from '@/lib/money';
import { cn } from '@/lib/utils';

/** Dashboard v2's Inventory tab (session 2026-09-19, Part N) —
    `listInventory` already covers name/SKU search plus low/out filters;
    no date range here, since stock is a point-in-time state, not a
    date-scoped list (unlike Orders/Customers/Plans). Editing stays on the
    full `/admin/inventory` bulk-edit page — this tab and its detail panel
    (`InventoryDetailPanel`, backed by the new stock-history query) are
    read-only, matching the reference's own detail-panel spirit. */

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

interface InventoryResponse {
  rows: InventoryRow[];
  page: number;
  perPage: number;
  total: number;
}

const PER_PAGE = 10;

export function InventoryExplorerTab() {
  const t = useTranslations('admin.inventory');
  const tc = useTranslations('admin.common');
  const locale = useLocale();

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'low' | 'out'>('all');
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const inventory = useQuery({
    queryKey: ['admin-dashboard-inventory', query, filter, page, locale],
    queryFn: () =>
      api.get<InventoryResponse>(
        `/api/admin/inventory${qs({
          locale,
          query: query || undefined,
          onlyLow: filter === 'low' ? 'true' : undefined,
          onlyOut: filter === 'out' ? 'true' : undefined,
          page,
          perPage: PER_PAGE,
        })}`,
      ),
    placeholderData: (previous) => previous,
  });

  const rows = inventory.data?.rows ?? [];
  const effectiveSelectedId = rows.some((row) => row.variantId === selectedId)
    ? selectedId
    : (rows[0]?.variantId ?? null);

  function selectRow(id: string) {
    setSelectedId(id);
    setDetailOpen(true);
  }

  return (
    <ExplorerSplit
      detailOpen={detailOpen}
      onCloseDetail={() => setDetailOpen(false)}
      detail={effectiveSelectedId ? <InventoryDetailPanel variantId={effectiveSelectedId} /> : null}
      list={
        <div className="card-3d overflow-hidden rounded-[var(--radius)] border border-border/60 bg-card">
          <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
            <h2 className="text-sm font-bold">
              {t('title')} <span className="font-normal text-muted-foreground">({inventory.data?.total ?? 0})</span>
            </h2>
            <div className="ml-auto flex flex-wrap items-center gap-2">
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
                  onClick={() => {
                    setFilter(value);
                    setPage(1);
                  }}
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
              <input
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setPage(1);
                }}
                placeholder={tc('search')}
                className="h-10 w-40 rounded-[var(--radius)] border border-border bg-secondary/40 px-3 text-sm outline-none sm:w-56"
              />
            </div>
          </div>

          {inventory.isLoading ? (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">{tc('loading')}</p>
          ) : rows.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">{tc('empty')}</p>
          ) : (
            <>
              <div className="hidden overflow-x-auto lg:block">
                <table className="w-full min-w-[560px] text-sm">
                  <thead className="border-b border-border bg-secondary/60 text-left text-xs text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 font-medium">{t('product')}</th>
                      <th className="px-3 py-2 font-medium">{t('variant')}</th>
                      <th className="px-3 py-2 text-right font-medium">{t('stock')}</th>
                      <th className="px-3 py-2 text-right font-medium">{t('price')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr
                        key={row.variantId}
                        onClick={() => selectRow(row.variantId)}
                        className={cn(
                          'cursor-pointer border-b border-border last:border-0 hover:bg-secondary/40',
                          effectiveSelectedId === row.variantId && 'border-l-4 border-l-primary bg-tint-green/40',
                        )}
                      >
                        <td className="px-3 py-2.5 text-sm font-medium">{row.productName}</td>
                        <td className="px-3 py-2.5 text-xs text-muted-foreground">{row.label}</td>
                        <td className="px-3 py-2.5 text-right">
                          <span
                            className={cn(
                              'font-semibold tabular-nums',
                              row.isOut ? 'text-danger' : row.isLow ? 'text-warning' : 'text-foreground',
                            )}
                          >
                            {row.stockQty}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-right font-semibold tabular-nums">
                          {formatPaise(paise(row.pricePaise), { hidePaise: true })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <ul className="flex flex-col gap-2.5 p-3 lg:hidden">
                {rows.map((row) => (
                  <li key={row.variantId}>
                    <button
                      type="button"
                      onClick={() => selectRow(row.variantId)}
                      className={cn(
                        'flex w-full items-center justify-between gap-2 rounded-[var(--radius)] border border-border/60 bg-card p-3 text-left',
                        effectiveSelectedId === row.variantId && 'border-l-4 border-l-primary bg-tint-green/40',
                      )}
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{row.productName}</p>
                        <p className="text-xs text-muted-foreground">{row.label}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p
                          className={cn(
                            'text-sm font-bold tabular-nums',
                            row.isOut ? 'text-danger' : row.isLow ? 'text-warning' : 'text-foreground',
                          )}
                        >
                          {row.stockQty}
                        </p>
                        <p className="text-[11px] text-muted-foreground">{t('stock')}</p>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>

              {inventory.data && (
                <ExplorerPagination
                  page={inventory.data.page}
                  perPage={inventory.data.perPage}
                  total={inventory.data.total}
                  onPageChange={setPage}
                />
              )}
            </>
          )}
        </div>
      }
    />
  );
}
