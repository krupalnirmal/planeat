import { Activity, ChevronLeft, Leaf, Search } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Link } from '@/i18n/navigation';
import { HeaderCartLink } from '@/components/shop/header-cart-link';
import { ProductCard } from '@/components/shop/product-card';
import { ProductDeliveryInfo } from '@/components/shop/product-delivery-info';
import { ProductGallery } from '@/components/shop/product-gallery';
import { ProductInfoAccordion } from '@/components/shop/product-info-accordion';
import { ProductWishlistButton } from '@/components/shop/product-wishlist-button';
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
        <h1 className="min-w-0 flex-1 truncate text-base font-bold">{product.name}</h1>
        {/* Cart badge + search — real chrome every other browsing screen
            already has (session 2026-09-21, client reference); the PDP
            just never had them wired in. `HeaderCartLink` already exists
            exactly for this ("the reference puts it in the header of every
            browsing screen ... product detail" per its own doc comment). */}
        <Link
          href="/search"
          aria-label={tc('search')}
          className="grid size-11 shrink-0 place-items-center rounded-full"
        >
          <Search className="size-5" aria-hidden />
        </Link>
        <HeaderCartLink />
      </header>

      {/* Stacked white slabs on the page colour, same as home. No more
          bottom padding reservation (session 2026-09-21, client reference)
          — VariantPicker's Add to Cart is a plain inline button now, not a
          bar fixed to the viewport bottom, so there's nothing left to
          reserve room for. */}
      <main className="space-y-2 pb-4">
        {/* `lg:flex` (session 2026-09-20, desktop layout plan Part D):
            gallery-then-info stacks below `lg:`, sits side by side above
            it — the standard PDP shape once there's room for it. */}
        <div className="bg-card px-4 pt-2 pb-4 lg:flex lg:gap-8 lg:px-8 lg:py-8">
          {/* Full-bleed hero photo (session 2026-09-21, client reference) —
              was capped at 240px to keep price/ADD above the fold on a
              phone; the reference wants a large hero shot instead, so the
              page now scrolls a bit more to reach them, same trade-off the
              reference itself makes. Swipeable when the admin uploaded more
              than one (M9). At `lg:` it's a fixed-width left column, same
              as before. The Organic badge and wishlist heart are this
              page's own overlays on top of the gallery's image box (see
              `ProductGallery`'s own doc comment) — real per-product
              conditions, not decoration: the badge only renders for a
              product actually tagged `organic`, which is currently no SKU
              in the catalogue (see DECISIONS in the session's redesign
              plan), so it simply won't show today rather than being
              slapped on every product. */}
          <div className="relative lg:w-[420px] lg:shrink-0">
            <ProductGallery images={product.images} alt={product.name} />
            {product.vegetableType === 'organic' && (
              <span className="absolute top-3 left-3 flex items-center gap-1 rounded-full bg-primary px-2.5 py-1 text-[11px] font-bold text-primary-foreground">
                <Leaf className="size-3" aria-hidden />
                {t('organicBadge')}
              </span>
            )}
            <ProductWishlistButton productId={product.id} productName={product.name} />
          </div>

          <div className="lg:min-w-0 lg:flex-1">
            <p className="mt-4 text-xs text-muted-foreground lg:mt-0">{product.categoryName}</p>
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

            <ProductDeliveryInfo />
          </div>
        </div>

        {/* Collapsed-by-default accordions (session 2026-09-21, client
            reference) — both sections used to always render open.
            "Product Details"' preview is the real `description` text,
            clamped to one line — genuinely representative, not fabricated.
            "Nutrition Facts"' preview can't honestly borrow the reference's
            carrot-specific prose ("Rich in Vitamin A, fiber and
            antioxidants" would misrepresent any other product's real
            nutrition data), so it uses a generic "tap to see" teaser
            instead; the real `<dl>` table is unchanged, just inside the
            expanded state now. */}
        {(product.description || (nutrition && Object.keys(nutrition).length > 0)) && (
          <section className="bg-card px-4">
            {product.description && (
              <ProductInfoAccordion icon={Leaf} title={t('productDetailsTitle')} preview={product.description}>
                <p className="text-sm leading-relaxed text-muted-foreground">{product.description}</p>
              </ProductInfoAccordion>
            )}

            {nutrition && Object.keys(nutrition).length > 0 && (
              <ProductInfoAccordion icon={Activity} title={t('nutritionTitle')} preview={t('nutritionPreview')}>
                <dl className="divide-y divide-border overflow-hidden rounded-[var(--radius)] border border-border">
                  {Object.entries(nutrition).map(([key, value]) => (
                    <div key={key} className="flex justify-between px-3 py-2.5 text-sm">
                      <dt className="text-muted-foreground capitalize">{key.replace(/_/g, ' ')}</dt>
                      <dd className="font-medium">{String(value)}</dd>
                    </div>
                  ))}
                </dl>
              </ProductInfoAccordion>
            )}
          </section>
        )}

        {/* Horizontal-scroll rail (session 2026-09-21, client reference) —
            was a wrapping 2/4-column grid. Reuses `ProductCard` exactly as
            it already is (it already has the wishlist heart and discount
            badge the reference shows on these mini-cards) with the same
            `compact` rail treatment `order-again-row.tsx`'s own rail
            already uses, just for consistency — no new card component. No
            "See All" link: unlike Order Again (→ /orders, a real page),
            there's no dedicated "all similar products" page to send anyone
            to. */}
        {product.similar.length > 0 && (
          <section className="bg-card px-4 py-4">
            <h3 className="mb-3 text-sm font-semibold">{t('similar')}</h3>
            <ul className="-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-2.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:mx-0 lg:grid lg:grid-cols-[repeat(auto-fill,132px)] lg:gap-3 lg:overflow-visible lg:px-0">
              {product.similar.map((item) => (
                <li key={item.id} className="w-[30vw] max-w-[132px] shrink-0 snap-start">
                  <ProductCard
                    compact
                    product={{
                      id: item.id,
                      name: item.name,
                      nameEn: item.nameEn,
                      localName: item.localName,
                      imageUrl: item.imageUrl,
                      images: item.images,
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
