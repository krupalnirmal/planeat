import { ChevronLeft } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Link } from '@/i18n/navigation';
import { ProductCard } from '@/components/shop/product-card';
import { getCategoryProducts, type ProductCardView } from '@/lib/catalog/queries';
import { VEGETABLE_TYPES, vegetableTypeLabel } from '@/lib/catalog/vegetable-types';
import type { AppLocale } from '@/i18n/routing';

/** Category listing (M2). Server-rendered, cached for a minute. */
export const revalidate = 60;

const PER_PAGE = 24;

function ProductGrid({ products }: { products: ProductCardView[] }) {
  return (
    <ul className="grid grid-cols-2 gap-3">
      {products.map((product) => (
        <li key={product.id}>
          <ProductCard
            product={{
              id: product.id,
              name: product.name,
              imageUrl: product.imageUrl,
              unitType: product.unitType,
              inStock: product.inStock,
              variant: product.variant
                ? {
                    ...product.variant,
                    pricePaise: product.variant.pricePaise.toString(),
                    mrpPaise: product.variant.mrpPaise.toString(),
                  }
                : null,
            }}
          />
        </li>
      ))}
    </ul>
  );
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

  const t = await getTranslations('categories');
  const tc = await getTranslations('common');

  const page = Math.max(1, Number(pageParam ?? '1') || 1);

  const result = await getCategoryProducts(slug, locale as AppLocale, {
    skip: (page - 1) * PER_PAGE,
    take: PER_PAGE,
  }).catch(() => null);

  if (!result) notFound();

  const hasMore = page * PER_PAGE < result.total;

  // Client-requested grouping, Vegetables only (PER_PAGE comfortably covers
  // the whole category today, so every group is complete on page 1 — no
  // cross-page split to reconcile).
  const groups =
    slug === 'vegetables'
      ? VEGETABLE_TYPES.map((type) => ({
          type,
          products: result.products.filter((p) => p.vegetableType === type.id),
        })).filter((group) => group.products.length > 0)
      : null;
  const ungrouped = groups ? result.products.filter((p) => !p.vegetableType) : [];

  return (
    <>
      <header className="sticky top-0 z-30 flex items-center gap-2 border-b border-border bg-card px-3 py-3">
        <Link
          href="/"
          aria-label={tc('back')}
          className="grid size-11 shrink-0 place-items-center rounded-full"
        >
          <ChevronLeft className="size-5" aria-hidden />
        </Link>
        <div className="min-w-0">
          <h1 className="truncate text-base font-bold">{result.category.name}</h1>
          <p className="text-xs text-muted-foreground">{t('productCount', { count: result.total })}</p>
        </div>
      </header>

      <main className="px-4 py-4">
        {result.products.length === 0 ? (
          <p className="rounded-[var(--radius)] border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
            {t('empty')}
          </p>
        ) : groups ? (
          <div className="space-y-6">
            {groups.map(({ type, products }) => (
              <section key={type.id}>
                <h2 className="mb-3 flex items-center gap-1.5 text-[15px] font-bold">
                  <span aria-hidden>{type.emoji}</span>
                  {vegetableTypeLabel(type, locale as AppLocale)}
                </h2>
                <ProductGrid products={products} />
              </section>
            ))}
            {ungrouped.length > 0 && (
              <section>
                <h2 className="mb-3 text-[15px] font-bold">{t('other')}</h2>
                <ProductGrid products={ungrouped} />
              </section>
            )}
          </div>
        ) : (
          <ProductGrid products={result.products} />
        )}

        {(page > 1 || hasMore) && (
          <nav className="mt-6 flex items-center justify-between gap-3">
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
