'use client';

import { Filter, Search, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { vegetableTypeLabel, VEGETABLE_TYPES } from '@/lib/catalog/vegetable-types';
import type { AppLocale } from '@/i18n/routing';
import { cn } from '@/lib/utils';
import type { ProductCardData } from './product-card';
import { ProductRow } from './product-row';

export interface CategoryProduct extends ProductCardData {
  vegetableType: string | null;
}

// Client-supplied (public/banners/category_banner.png) — its copy ("Fresh
// vegetables, delivered daily") only makes sense on this one category, so
// it isn't a generic per-category banner slot.
const VEGETABLES_BANNER_URL =
  'https://res.cloudinary.com/kf9nvvpv/image/upload/v1786779984/planeat/banners/category-banner.jpg';

type SortOption = 'default' | 'priceAsc' | 'priceDesc' | 'nameAsc';

const SORT_OPTIONS: Array<{
  value: SortOption;
  labelKey: 'sortDefault' | 'sortPriceAsc' | 'sortPriceDesc' | 'sortNameAsc';
}> = [
  { value: 'default', labelKey: 'sortDefault' },
  { value: 'priceAsc', labelKey: 'sortPriceAsc' },
  { value: 'priceDesc', labelKey: 'sortPriceDesc' },
  { value: 'nameAsc', labelKey: 'sortNameAsc' },
];

/**
 * The reference's list-row category screen: an in-page search that filters
 * the products already on the page (a category comfortably fits on one
 * load, per the pagination above), plus a real sort menu standing in for
 * the reference's "Filter" button — no fake filter facets the catalogue
 * cannot actually answer.
 */
export function CategoryProductList({
  products,
  slug,
  categoryName,
  locale,
}: {
  products: CategoryProduct[];
  slug: string;
  categoryName: string;
  locale: AppLocale;
}) {
  const t = useTranslations('categories');
  const tc = useTranslations('common');

  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortOption>('default');
  const [sortOpen, setSortOpen] = useState(false);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return term ? products.filter((p) => p.name.toLowerCase().includes(term)) : products;
  }, [products, query]);

  const sorted = useMemo(() => {
    if (sort === 'default') return filtered;
    const copy = [...filtered];
    const priceOf = (p: CategoryProduct) => Number(p.variant?.pricePaise ?? 0);
    copy.sort((a, b) => {
      if (sort === 'nameAsc') return a.name.localeCompare(b.name);
      return sort === 'priceAsc' ? priceOf(a) - priceOf(b) : priceOf(b) - priceOf(a);
    });
    return copy;
  }, [filtered, sort]);

  // Grouping is a separate, earlier client request (vegetables only) — kept
  // for the default view, but a search collapses to one flat, easy-to-scan
  // list rather than making someone hunt across sub-groups for a match.
  const searching = query.trim().length > 0;
  const groups =
    !searching && slug === 'vegetables'
      ? VEGETABLE_TYPES.map((type) => ({
          type,
          products: sorted.filter((p) => p.vegetableType === type.id),
        })).filter((group) => group.products.length > 0)
      : null;
  const rest = groups ? sorted.filter((p) => !p.vegetableType) : sorted;

  return (
    <>
      <div className="flex items-center gap-2 bg-card px-4 pt-3 pb-2">
        <div className="input-3d flex h-11 flex-1 items-center gap-2 rounded-[var(--radius)] bg-background px-3">
          <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('searchPlaceholder', { category: categoryName })}
            aria-label={t('searchPlaceholder', { category: categoryName })}
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label={tc('close')}
              className="grid size-6 shrink-0 place-items-center text-muted-foreground"
            >
              <X className="size-3.5" aria-hidden />
            </button>
          )}
        </div>

        <div className="relative shrink-0">
          <button
            type="button"
            onClick={() => setSortOpen((open) => !open)}
            aria-expanded={sortOpen}
            className="flex h-11 items-center gap-1.5 rounded-[var(--radius)] border border-border px-3 text-sm font-semibold"
          >
            <Filter className="size-4" aria-hidden />
            {t('filter')}
          </button>

          {sortOpen && (
            <>
              <button
                type="button"
                aria-label={tc('close')}
                onClick={() => setSortOpen(false)}
                className="fixed inset-0 z-10 cursor-default"
              />
              <div className="absolute top-full right-0 z-20 mt-1 w-48 overflow-hidden rounded-[var(--radius)] border border-border bg-card py-1 shadow-lg">
                {SORT_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => {
                      setSort(option.value);
                      setSortOpen(false);
                    }}
                    className={cn(
                      'block w-full px-3 py-2.5 text-left text-sm',
                      sort === option.value ? 'font-bold text-primary' : 'text-foreground',
                    )}
                  >
                    {t(option.labelKey)}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {slug === 'vegetables' && (
        <div className="bg-card px-4 pb-3">
          <div className="overflow-hidden rounded-[var(--radius)] shadow-sm">
            {/* Whole creative, never cropped — same rule as the home
                carousel's banners. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={VEGETABLES_BANNER_URL}
              alt={t('vegetablesBannerAlt')}
              className="block h-auto w-full"
            />
          </div>
        </div>
      )}

      {sorted.length === 0 ? (
        <div className="bg-card px-4 pb-4">
          <p className="rounded-[var(--radius)] border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
            {t('empty')}
          </p>
        </div>
      ) : groups ? (
        <>
          {groups.map(({ type, products: groupProducts }) => (
            <section key={type.id} className="bg-card px-4 pb-2">
              <h2 className="flex items-center gap-1.5 text-[15px] font-bold">
                <span aria-hidden>{type.emoji}</span>
                {vegetableTypeLabel(type, locale)}
              </h2>
              <div className="divide-y divide-border">
                {groupProducts.map((product) => (
                  <ProductRow key={product.id} product={product} />
                ))}
              </div>
            </section>
          ))}
          {rest.length > 0 && (
            <section className="bg-card px-4 pb-2">
              <h2 className="text-[15px] font-bold">{t('other')}</h2>
              <div className="divide-y divide-border">
                {rest.map((product) => (
                  <ProductRow key={product.id} product={product} />
                ))}
              </div>
            </section>
          )}
        </>
      ) : (
        <div className="bg-card px-4 pb-2">
          <div className="divide-y divide-border">
            {rest.map((product) => (
              <ProductRow key={product.id} product={product} />
            ))}
          </div>
        </div>
      )}
    </>
  );
}
