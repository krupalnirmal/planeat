import { ChevronLeft } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Link } from '@/i18n/navigation';
import { CategoryProductList, type CategoryProduct } from '@/components/shop/category-product-list';
import { HeaderCartLink } from '@/components/shop/header-cart-link';
import { getCategoryProducts } from '@/lib/catalog/queries';
import type { AppLocale } from '@/i18n/routing';

/** Category listing (M2). Server-rendered, cached for a minute. */
export const revalidate = 60;

const PER_PAGE = 24;

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

  const t = await getTranslations('categories');
  const tc = await getTranslations('common');

  const page = Math.max(1, Number(pageParam ?? '1') || 1);

  const result = await getCategoryProducts(slug, locale as AppLocale, {
    skip: (page - 1) * PER_PAGE,
    take: PER_PAGE,
  }).catch(() => null);

  if (!result) notFound();

  const hasMore = page * PER_PAGE < result.total;

  const products: CategoryProduct[] = result.products.map((product) => ({
    id: product.id,
    name: product.name,
    imageUrl: product.imageUrl,
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
  }));

  return (
    <>
      <header className="sticky top-0 z-30 flex items-center gap-2 border-b border-border bg-accent-faint px-3 py-3">
        <Link
          href="/"
          aria-label={tc('back')}
          className="grid size-11 shrink-0 place-items-center rounded-full"
        >
          <ChevronLeft className="size-5" aria-hidden />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-bold">{result.category.name}</h1>
          <p className="text-xs text-muted-foreground">{t('productCount', { count: result.total })}</p>
        </div>
        <HeaderCartLink />
      </header>

      {/* Stacked white slabs on the page colour, same as home — a group
          heading sitting directly on the background is what made these read
          as scattered rather than as one list. */}
      <main className="space-y-2 pb-2">
        <CategoryProductList
          products={products}
          slug={slug}
          categoryName={result.category.name}
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
