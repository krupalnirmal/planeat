import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { Link } from '@/i18n/navigation';
import { CategoryHeader } from '@/components/shop/category-header';
import { CategoryProductList, type CategoryProduct } from '@/components/shop/category-product-list';
import { getCategories, getCategoryProducts } from '@/lib/catalog/queries';
import { alternatesFor } from '@/lib/seo';
import type { Metadata } from 'next';
import type { AppLocale } from '@/i18n/routing';

/** Category listing (M2). Server-rendered, cached for a minute. */
export const revalidate = 60;

const PER_PAGE = 24;

// React's per-request memoization (not a cross-request cache — `revalidate`
// above already covers that) — `generateMetadata` and the page component
// both need the category's name, and without this they'd each run their own
// DB query for it (PART 12).
const getCachedCategoryProducts = cache(getCategoryProducts);

/**
 * SEO audit (session 2026-10-02) — category pages had no metadata of their
 * own; every one of them showed the same generic site-wide title.
 */
export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; slug: string }>;
  searchParams: Promise<{ page?: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  const { page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam ?? '1') || 1);

  const [result, t] = await Promise.all([
    getCachedCategoryProducts(slug, locale as AppLocale, {
      skip: (page - 1) * PER_PAGE,
      take: PER_PAGE,
    }).catch(() => null),
    getTranslations({ locale, namespace: 'seo' }),
  ]);

  if (!result) return {};

  // Self-referencing, not collapsed to page 1 — page 2+ genuinely has
  // different products, so canonicalizing it away from itself would tell
  // Google to drop it from the index entirely rather than just de-duplicate.
  const path = `/category/${slug}${page > 1 ? `?page=${page}` : ''}`;

  return {
    title: t('categoryTitle', { category: result.category.name }),
    description: t('categoryDescription', { category: result.category.name }),
    alternates: alternatesFor(locale as AppLocale, path),
  };
}

export default async function CategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; slug: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { locale, slug } = await params;
  const { page: pageParam } = await searchParams;
  setRequestLocale(locale);

  const tc = await getTranslations('common');

  const page = Math.max(1, Number(pageParam ?? '1') || 1);

  const [result, categories] = await Promise.all([
    getCachedCategoryProducts(slug, locale as AppLocale, {
      skip: (page - 1) * PER_PAGE,
      take: PER_PAGE,
    }).catch(() => null),
    getCategories(locale as AppLocale),
  ]);

  if (!result) notFound();

  const hasMore = page * PER_PAGE < result.total;

  const products: CategoryProduct[] = result.products.map((product) => ({
    id: product.id,
    name: product.name,
    nameEn: product.nameEn,
    localName: product.localName,
    imageUrl: product.imageUrl,
    images: product.images,
    unitType: product.unitType,
    inStock: product.inStock,
    vegetableType: product.vegetableType,
    variant: product.variant
      ? {
          ...product.variant,
          pricePaise: product.variant.pricePaise.toString(),
          mrpPaise: product.variant.mrpPaise.toString(),
        }
      : null,
    variants: product.variants.map((variant) => ({
      ...variant,
      pricePaise: variant.pricePaise.toString(),
      mrpPaise: variant.mrpPaise.toString(),
    })),
  }));

  return (
    <>
      <CategoryHeader />

      {/* Stacked white slabs on the page colour, same as home — a group
          heading sitting directly on the background is what made these read
          as scattered rather than as one list. */}
      <main className="space-y-2 pb-2">
        <CategoryProductList
          products={products}
          slug={slug}
          categoryName={result.category.name}
          categories={categories}
          locale={locale as AppLocale}
        />

        {(page > 1 || hasMore) && (
          <nav className="flex items-center justify-between gap-3 bg-card px-4 py-4">
            {page > 1 ? (
              <Link
                href={`/category/${slug}?page=${page - 1}`}
                className="flex h-11 flex-1 items-center justify-center rounded-[var(--radius)] border border-border text-sm font-medium"
              >
                {tc('back')}
              </Link>
            ) : (
              <span className="flex-1" />
            )}
            {hasMore && (
              <Link
                href={`/category/${slug}?page=${page + 1}`}
                className="flex h-11 flex-1 items-center justify-center rounded-[var(--radius)] border border-primary text-sm font-bold text-primary"
              >
                {tc('next')}
              </Link>
            )}
          </nav>
        )}
      </main>
    </>
  );
}
