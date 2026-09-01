import { ChevronLeft, ImageIcon } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Link } from '@/i18n/navigation';
import { ProductCard } from '@/components/shop/product-card';
import { VariantPicker } from '@/components/shop/variant-picker';
import { getProductDetail } from '@/lib/catalog/queries';
import type { AppLocale } from '@/i18n/routing';

/**
 * Product detail (M2): gallery, description, variants, nutrition, similar
 * products.
 *
 * The "why this is good for you" block lands in Phase 4, once a health profile
 * and a meal plan exist to say anything meaningful about.
 */
export const revalidate = 60;

export default async function ProductPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const t = await getTranslations('product');
  const tc = await getTranslations('common');

  const product = await getProductDetail(id, locale as AppLocale).catch(() => null);
  if (!product) notFound();

  const nutrition =
    product.nutrition && typeof product.nutrition === 'object'
      ? (product.nutrition as Record<string, unknown>)
      : null;

  return (
    <>
      <header className="sticky top-0 z-30 flex items-center gap-2 border-b border-border bg-accent-faint px-3 py-3">
        <Link
          href={`/category/${product.categorySlug}`}
          aria-label={tc('back')}
          className="grid size-11 shrink-0 place-items-center rounded-full"
        >
          <ChevronLeft className="size-5" aria-hidden />
        </Link>
        <h1 className="truncate text-base font-bold">{product.name}</h1>
      </header>

      {/* Stacked white slabs on the page colour, same as home.
          `pb-24` reserves room for VariantPicker's own fixed add-to-cart
          bar (71px tall). That reservation used to be a `h-16` spacer
          inside VariantPicker itself, which sits mid-page — so it punched
          a 64px hole under the price instead of protecting the last
          section, the thing it was there for. */}
      <main className="space-y-2 pb-24">
        <div className="bg-card px-4 pt-2 pb-4">
          {/* The photo is a product shot, not a hero image: a full-width
              square ran ~390px tall on a phone and pushed the price and the
              ADD button below the fold. Capped and centred, it stays the
              first thing you see without being the only thing. */}
          <div className="mx-auto grid aspect-square w-full max-w-[240px] place-items-center overflow-hidden rounded-[var(--radius)] bg-white">
            {product.images[0] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={product.images[0]}
                alt={product.name}
                className="size-full object-cover"
                decoding="async"
              />
            ) : (
              <ImageIcon className="size-16 text-muted-foreground/30" aria-hidden />
            )}
          </div>

          <p className="mt-4 text-xs text-muted-foreground">{product.categoryName}</p>
          {/* "English (Marathi)" — same bilingual format as the product
              cards (session 2026-09-01). The sticky header above stays
              plain (`product.name`, single-locale) — it's a narrow,
              truncated bar, and the bracketed name is more likely to get
              cut off there than to add anything. */}
          <h2 className="mt-0.5 text-lg leading-snug font-bold">
            {product.nameEn}
            {product.localName && (
              <span className="font-normal text-muted-foreground"> ({product.localName})</span>
            )}
          </h2>

          <VariantPicker
            productId={product.id}
            productName={product.name}
            variants={product.variants.map((v) => ({
              id: v.id,
              label: v.label,
              quantity: v.quantity,
              unit: v.unit,
              pricePaise: v.pricePaise.toString(),
              mrpPaise: v.mrpPaise.toString(),
              stockQty: v.stockQty,
              lowStockThreshold: v.lowStockThreshold,
              isDefault: v.isDefault,
            }))}
          />

        </div>

        {product.description && (
          <section className="bg-card px-4 py-4">
            <h3 className="text-sm font-semibold">{t('description')}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
              {product.description}
            </p>
          </section>
        )}

        {nutrition && Object.keys(nutrition).length > 0 && (
          <section className="bg-card px-4 py-4">
            <h3 className="text-sm font-semibold">{t('nutrition')}</h3>
            <dl className="mt-2 divide-y divide-border overflow-hidden rounded-[var(--radius)] border border-border">
              {Object.entries(nutrition).map(([key, value]) => (
                <div key={key} className="flex justify-between px-3 py-2.5 text-sm">
                  <dt className="text-muted-foreground capitalize">{key.replace(/_/g, ' ')}</dt>
                  <dd className="font-medium">{String(value)}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}

        {product.similar.length > 0 && (
          <section className="bg-card px-4 py-4">
            <h3 className="mb-3 text-sm font-semibold">{t('similar')}</h3>
            <ul className="grid grid-cols-2 gap-3">
              {product.similar.map((item) => (
                <li key={item.id}>
                  <ProductCard
                    product={{
                      id: item.id,
                      name: item.name,
                      nameEn: item.nameEn,
                      localName: item.localName,
                      imageUrl: item.imageUrl,
                      unitType: item.unitType,
                      inStock: item.inStock,
                      variant: item.variant
                        ? {
                            ...item.variant,
                            pricePaise: item.variant.pricePaise.toString(),
                            mrpPaise: item.variant.mrpPaise.toString(),
                          }
                        : null,
                    }}
                  />
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </>
  );
}
