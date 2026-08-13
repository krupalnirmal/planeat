'use client';

import { useQuery } from '@tanstack/react-query';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { AdminPageHeader, AdminTable } from '@/components/admin/admin-shell';
import { api, qs } from '@/lib/api/client';
import { formatPaise, paise } from '@/lib/money';

/**
 * The read-oriented admin sections: waitlist, swap log, audit log, customers
 * and catalogue.
 *
 * Grouped in one file because they share exactly one shape — a filtered table
 * over an admin endpoint — and five near-identical files would be five places
 * to fix the same layout bug.
 */

// ─────────────────────────────────────────────────────────────
// B11 — waitlist demand by pincode
// ─────────────────────────────────────────────────────────────

export function AdminWaitlistScreen() {
  const t = useTranslations('admin.waitlist');
  const tc = useTranslations('admin.common');
  const format = useFormatter();

  const waitlist = useQuery({
    queryKey: ['admin-waitlist'],
    queryFn: () =>
      api.get<{ pincodes: Array<{ pincode: string; count: number; latest: string }> }>(
        '/api/admin/waitlist',
      ),
  });

  const rows = waitlist.data?.pincodes ?? [];

  return (
    <>
      {/* B11 — "that is how the owner decides where to expand". */}
      <AdminPageHeader title={t('title')} subtitle={t('hint')} />

      {waitlist.isLoading ? (
        <p className="text-sm text-muted-foreground">{tc('loading')}</p>
      ) : rows.length === 0 ? (
        <EmptyState label={tc('empty')} />
      ) : (
        <AdminTable>
          <TableHead labels={[t('pincode'), t('count'), t('latest')]} align={['left', 'right', 'left']} />
          <tbody>
            {rows.map((row) => (
              <tr key={row.pincode} className="border-b border-border last:border-0">
                <td className="px-3 py-2.5 font-mono">{row.pincode}</td>
                <td className="px-3 py-2.5 text-right text-base font-bold tabular-nums">
                  {row.count}
                </td>
                <td className="px-3 py-2.5 text-xs text-muted-foreground">
                  {format.dateTime(new Date(row.latest), { day: 'numeric', month: 'short' })}
                </td>
              </tr>
            ))}
          </tbody>
        </AdminTable>
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// B6 — the swap log. Read-only, deliberately.
// ─────────────────────────────────────────────────────────────

export function AdminSwapsScreen() {
  const t = useTranslations('admin.swaps');
  const tc = useTranslations('admin.common');
  const tSwap = useTranslations('swap');
  const format = useFormatter();

  const swaps = useQuery({
    queryKey: ['admin-swaps'],
    queryFn: () =>
      api.get<{
        swaps: Array<{
          id: string;
          customerName: string;
          customerPhone: string;
          reasonCode: string;
          reasonText: string | null;
          status: string;
          createdAt: string;
        }>;
      }>(`/api/admin/swap-requests${qs({ perPage: 50 })}`),
  });

  const rows = swaps.data?.swaps ?? [];

  return (
    <>
      {/* B6 — "visibility without a gate". There is no approve button here,
          and there is no approve endpoint to build one on. */}
      <AdminPageHeader title={t('title')} subtitle={t('hint')} />

      {swaps.isLoading ? (
        <p className="text-sm text-muted-foreground">{tc('loading')}</p>
      ) : rows.length === 0 ? (
        <EmptyState label={tc('empty')} />
      ) : (
        <AdminTable>
          <TableHead
            labels={[tc('search'), t('reason'), tc('date')]}
            align={['left', 'left', 'left']}
          />
          <tbody>
            {rows.map((swap) => (
              <tr key={swap.id} className="border-b border-border last:border-0">
                <td className="px-3 py-2.5">
                  <span className="block font-medium">{swap.customerName}</span>
                  <span className="text-xs text-muted-foreground">{swap.customerPhone}</span>
                </td>
                <td className="px-3 py-2.5 text-xs">
                  {tSwap(`reason${swap.reasonCode}`)}
                  {swap.reasonText && (
                    <span className="block text-muted-foreground">“{swap.reasonText}”</span>
                  )}
                </td>
                <td className="px-3 py-2.5 text-xs text-muted-foreground">
                  {format.dateTime(new Date(swap.createdAt), {
                    day: 'numeric',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </td>
              </tr>
            ))}
          </tbody>
        </AdminTable>
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// M9 — the audit log
// ─────────────────────────────────────────────────────────────

export function AdminAuditLogScreen() {
  const t = useTranslations('admin.audit');
  const tc = useTranslations('admin.common');
  const format = useFormatter();

  const logs = useQuery({
    queryKey: ['admin-audit'],
    queryFn: () =>
      api.get<{
        entries: Array<{
          id: string;
          actorName: string | null;
          action: string;
          entityType: string;
          entityId: string;
          before: unknown;
          after: unknown;
          createdAt: string;
        }>;
      }>(`/api/admin/audit-logs${qs({ perPage: 50 })}`),
  });

  const rows = logs.data?.entries ?? [];

  return (
    <>
      <AdminPageHeader title={t('title')} />

      {logs.isLoading ? (
        <p className="text-sm text-muted-foreground">{tc('loading')}</p>
      ) : rows.length === 0 ? (
        <EmptyState label={t('empty')} />
      ) : (
        <AdminTable>
          <TableHead
            labels={[t('when'), t('who'), t('what'), t('entity'), t('before'), t('after')]}
            align={['left', 'left', 'left', 'left', 'left', 'left']}
          />
          <tbody>
            {rows.map((entry) => (
              <tr key={entry.id} className="border-b border-border last:border-0 align-top">
                <td className="px-3 py-2.5 text-xs whitespace-nowrap text-muted-foreground">
                  {format.dateTime(new Date(entry.createdAt), {
                    day: 'numeric',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </td>
                <td className="px-3 py-2.5 text-xs">{entry.actorName ?? '—'}</td>
                <td className="px-3 py-2.5 font-mono text-xs">{entry.action}</td>
                <td className="px-3 py-2.5 font-mono text-[11px] text-muted-foreground">
                  {entry.entityType}
                </td>
                {/* before/after are the point — "somebody changed the fee" is
                    not useful; "₹25 → ₹40" is. */}
                <td className="max-w-40 px-3 py-2.5 font-mono text-[11px] break-all text-muted-foreground">
                  {summarise(entry.before)}
                </td>
                <td className="max-w-40 px-3 py-2.5 font-mono text-[11px] break-all">
                  {summarise(entry.after)}
                </td>
              </tr>
            ))}
          </tbody>
        </AdminTable>
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// M9 — customers
// ─────────────────────────────────────────────────────────────

export function AdminCustomersScreen() {
  const t = useTranslations('admin.customers');
  const tc = useTranslations('admin.common');
  const format = useFormatter();

  const [query, setQuery] = useState('');

  const customers = useQuery({
    queryKey: ['admin-customers', query],
    queryFn: () =>
      api.get<{
        customers: Array<{
          id: string;
          name: string | null;
          phone: string;
          orderCount: number;
          hasHealthProfile: boolean;
          hasActiveSubscription: boolean;
          createdAt: string;
        }>;
      }>(`/api/admin/customers${qs({ query: query || undefined, perPage: 50 })}`),
  });

  const rows = customers.data?.customers ?? [];

  return (
    <>
      <AdminPageHeader title={t('title')} />

      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={t('search')}
        className="mb-3 h-10 w-full max-w-sm rounded-[var(--radius)] border border-border bg-card px-3 text-sm outline-none"
      />

      {customers.isLoading ? (
        <p className="text-sm text-muted-foreground">{tc('loading')}</p>
      ) : rows.length === 0 ? (
        <EmptyState label={tc('empty')} />
      ) : (
        <AdminTable>
          <TableHead
            labels={[t('name'), t('phone'), t('orders'), t('hasPlan'), t('joined')]}
            align={['left', 'left', 'right', 'left', 'left']}
          />
          <tbody>
            {rows.map((customer) => (
              <tr key={customer.id} className="border-b border-border last:border-0">
                <td className="px-3 py-2.5 font-medium">{customer.name ?? '—'}</td>
                <td className="px-3 py-2.5 font-mono text-xs">{customer.phone}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{customer.orderCount}</td>
                <td className="px-3 py-2.5 text-xs">
                  {customer.hasActiveSubscription ? '✓' : '—'}
                  {/* S6 — we say a health profile EXISTS, never what is in it.
                      Reading one is a separate, logged, Super-Admin-only call. */}
                </td>
                <td className="px-3 py-2.5 text-xs text-muted-foreground">
                  {format.dateTime(new Date(customer.createdAt), {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}
                </td>
              </tr>
            ))}
          </tbody>
        </AdminTable>
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// M9 — catalogue
// ─────────────────────────────────────────────────────────────

export function AdminCatalogueScreen() {
  const t = useTranslations('admin.catalogue');
  const tc = useTranslations('admin.common');
  const locale = useLocale();

  const [query, setQuery] = useState('');

  const products = useQuery({
    queryKey: ['admin-products', query, locale],
    queryFn: () =>
      api.get<{
        products: Array<{
          id: string;
          sku: string;
          name: string;
          categorySlug: string;
          variantCount: number;
          aliasCount: number;
          isMealPlanEligible: boolean;
          lowestPricePaise: string | null;
          totalStock: number;
        }>;
      }>(`/api/admin/products${qs({ query: query || undefined, locale, perPage: 50 })}`),
  });

  const rows = products.data?.products ?? [];

  return (
    <>
      <AdminPageHeader title={t('title')} subtitle={t('aliasHint')} />

      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={tc('search')}
        className="mb-3 h-10 w-full max-w-sm rounded-[var(--radius)] border border-border bg-card px-3 text-sm outline-none"
      />

      {products.isLoading ? (
        <p className="text-sm text-muted-foreground">{tc('loading')}</p>
      ) : rows.length === 0 ? (
        <EmptyState label={tc('empty')} />
      ) : (
        <AdminTable>
          <TableHead
            labels={[
              t('name'),
              t('category'),
              t('variants'),
              t('aliases'),
              t('mealPlanEligible'),
              'Stock',
            ]}
            align={['left', 'left', 'right', 'right', 'left', 'right']}
          />
          <tbody>
            {rows.map((product) => (
              <tr key={product.id} className="border-b border-border last:border-0">
                <td className="px-3 py-2.5">
                  <span className="block font-medium">{product.name}</span>
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {product.sku}
                    {product.lowestPricePaise &&
                      ` · ${formatPaise(paise(product.lowestPricePaise), { hidePaise: true })}`}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-xs text-muted-foreground">
                  {product.categorySlug}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">{product.variantCount}</td>
                {/* M4 — the alias count is the number that predicts Smart List
                    accuracy for this product. */}
                <td className="px-3 py-2.5 text-right tabular-nums">{product.aliasCount}</td>
                <td className="px-3 py-2.5 text-xs">
                  {product.isMealPlanEligible ? '✓' : '—'}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">{product.totalStock}</td>
              </tr>
            ))}
          </tbody>
        </AdminTable>
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// Shared bits
// ─────────────────────────────────────────────────────────────

function TableHead({
  labels,
  align,
}: {
  labels: string[];
  align: Array<'left' | 'right'>;
}) {
  return (
    <thead className="border-b border-border bg-secondary/60 text-xs text-muted-foreground">
      <tr>
        {labels.map((label, index) => (
          <th
            key={label}
            className={`px-3 py-2 font-medium ${align[index] === 'right' ? 'text-right' : 'text-left'}`}
          >
            {label}
          </th>
        ))}
      </tr>
    </thead>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <p className="rounded-[var(--radius)] border border-dashed border-border bg-card px-4 py-10 text-center text-sm text-muted-foreground">
      {label}
    </p>
  );
}

/** A diff cell has to fit in a table row, so long JSON is truncated. */
function summarise(value: unknown): string {
  if (value === null || value === undefined) return '—';
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return text.length > 90 ? `${text.slice(0, 90)}…` : text;
}
