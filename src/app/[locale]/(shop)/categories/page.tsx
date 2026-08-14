import { ChevronRight, ImageIcon } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { HeaderCartLink } from '@/components/shop/header-cart-link';
import { PageHeader } from '@/components/shop/page-header';
import { getCategories } from '@/lib/catalog/queries';
import type { AppLocale } from '@/i18n/routing';

/** All-categories browse screen — the client's reference screen 6. */
export const revalidate = 60;

export default async function CategoriesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations('categories');
  const tc = await getTranslations('common');

  const categories = await getCategories(locale as AppLocale);

  return (
    <>
      <PageHeader
        title={t('title')}
        backHref="/"
        backLabel={tc('back')}
        trailing={<HeaderCartLink />}
      />
      <main className="pb-2">
        <div className="bg-card px-4">
          {categories.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">{t('empty')}</p>
          ) : (
            <ul className="divide-y divide-border">
              {categories.map((category) => (
                <li key={category.id}>
                  <Link
                    href={`/category/${category.slug}`}
                    className="flex items-center gap-3 py-3"
                  >
                    <span className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-[var(--radius)] border border-border bg-white">
                      {category.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={category.imageUrl}
                          alt=""
                          aria-hidden
                          className="size-full object-cover"
                        />
                      ) : (
                        <ImageIcon className="size-6 text-muted-foreground/40" aria-hidden />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-bold">{category.name}</span>
                      <span className="block text-xs text-muted-foreground">
                        {t('productCount', { count: category.productCount })}
                      </span>
                    </span>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
    </>
  );
}
