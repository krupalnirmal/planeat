'use client';

import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { AdminPageHeader, AdminTable } from '@/components/admin/admin-shell';
import { Link } from '@/i18n/navigation';
import { api, qs } from '@/lib/api/client';
import { formatPaise, paise } from '@/lib/money';

/**
 * M9 — Catalogue list. Was read-only (session 2026-08-something) over an
 * already-complete create/edit API — see product-form-screen.tsx for the
 * screen that now actually uses createProduct/updateProduct/upsertVariant.
 */

interface ProductRow {
  id: string;
  sku: string;
  name: string;
  categorySlug: string;
  variantCount: number;
  aliasCount: number;
  isMealPlanEligible: boolean;
  lowestPricePaise: string | null;
  totalStock: number;
}

export function AdminCatalogueScreen() {
  const t = useTranslations('admin.catalogue');
  const tc = useTranslations('admin.common');
  const locale = useLocale();

  const [query, setQuery] = useState('');

  const products = useQuery({
    queryKey: ['admin-products', query, locale],
    queryFn: () =>
      api.get<{ products: ProductRow[] }>(
        `/api/admin/products${qs({ query: query || undefined, locale, perPage: 50 })}`,
      ),
  });

  const rows = products.data?.products ?? [];

  return (
    <>
      <AdminPageHeader
        title={t('title')}
        subtitle={t('aliasHint')}
        action={
          <Link
            href="/admin/catalogue/new"
            className="flex h-10 items-center gap-1.5 rounded-[var(--radius)] bg-primary px-3 text-xs font-bold text-primary-foreground"
          >
            <Plus className="size-3.5" aria-hidden />
            {t('addProduct')}
          </Link>
        }
      />

      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={tc('search')}
        className="mb-3 h-10 w-full max-w-sm rounded-[var(--radius)] border border-border bg-card px-3 text-sm outline-none"
      />

      {products.isLoading ? (
        <p className="text-sm text-muted-foreground">{tc('loading')}</p>
      ) : rows.length === 0 ? (
        <p className="rounded-[var(--radius)] border border-dashed border-border bg-card px-4 py-10 text-center text-sm text-muted-foreground">
          {tc('empty')}
        </p>
      ) : (
        <AdminTable>
          <thead className="border-b border-border bg-secondary/60 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">{t('name')}</th>
              <th className="px-3 py-2 font-medium">{t('category')}</th>
              <th className="px-3 py-2 text-right font-medium">{t('variants')}</th>
              <th className="px-3 py-2 text-right font-medium">{t('aliases')}</th>
              <th className="px-3 py-2 font-medium">{t('mealPlanEligible')}</th>
              <th className="px-3 py-2 text-right font-medium">{t('stock')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((product) => (
              <tr key={product.id} className="border-b border-border last:border-0 hover:bg-secondary/40">
                <td className="px-3 py-2.5">
                  <Link href={`/admin/catalogue/${product.id}`} className="block font-medium text-primary hover:underline">
                    {product.name}
                  </Link>
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {product.sku}
                    {product.lowestPricePaise &&
                      ` · ${formatPaise(paise(product.lowestPricePaise), { hidePaise: true })}`}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-xs text-muted-foreground">{product.categorySlug}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{product.variantCount}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{product.aliasCount}</td>
                <td className="px-3 py-2.5 text-xs">{product.isMealPlanEligible ? '✓' : '—'}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{product.totalStock}</td>
              </tr>
            ))}
          </tbody>
        </AdminTable>
      )}
    </>
  );
}
