import { Bike, ChevronRight, Heart, LayoutGrid, Leaf, Sprout, Truck } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { AppHeader } from '@/components/shop/app-header';
import { BannerCarousel } from '@/components/shop/banner-carousel';
import { CategoryCollageTile } from '@/components/shop/category-collage-tile';
import { ProductCard } from '@/components/shop/product-card';
import { getHomePayload } from '@/lib/catalog/queries';
import type { AppLocale } from '@/i18n/routing';
import type { HomePayload } from '@/lib/catalog/queries';

/**
 * Home (M2) — now data-driven from the catalogue.
 *
 * Rendered on the server so the first paint carries real content: on a
 * mid-range Android phone over rural 4G, a client-side fetch here would show a
 * spinner for the first second of every visit (R10).
 *
 * The database is read directly rather than through `/api/home` — a server
 * component calling its own HTTP endpoint pays a needless network hop. The
 * route exists for the client-side and Capacitor cases.
 */
export const revalidate = 60;

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations('home');
  const tc = await getTranslations('common');

  let payload: HomePayload | null = null;
  try {
    payload = await getHomePayload(locale as AppLocale);
  } catch {
    // No DATABASE_URL yet, or the schema has not been pushed. The shell still
    // renders, which is what makes a fresh clone runnable.
    payload = null;
  }

  const categories = payload?.categories ?? [];
  const collages = payload?.collages ?? [];
  const bestsellers = payload?.bestsellers ?? [];
  const banners = payload?.banners ?? [];

  // A handful of real vegetable photos for the fallback hero's collage,
  // rather than one hero image nobody uploaded yet — the catalogue itself is
  // the source, so the cluster is never a placeholder.
  const heroImages = (collages.find((c) => c.categorySlug === 'vegetables')?.images ?? []).slice(
    0,
    3,
  );

  return (
    <>
      <AppHeader />

      <main className="px-4 py-4">
        {banners.length > 0 ? (
          <BannerCarousel banners={banners} />
        ) : (
          <div className="mb-6">
            <HeroBanner
              headline={t('heroHeadline')}
              subtitle={t('heroSubtitle')}
              badge={t('deliveryIn', { minutes: 30 })}
              images={heroImages}
            />
          </div>
        )}

        <BenefitsRow />

        <section aria-labelledby="categories-heading" className="mb-8">
          <div className="mb-3 flex items-baseline justify-between">
            <h2
              id="categories-heading"
              className="flex items-center gap-1.5 text-[17px] font-bold"
            >
              <LayoutGrid className="size-4.5 text-primary" aria-hidden />
              {t('categories')}
            </h2>
            <Link
              href="/category/vegetables"
              className="flex items-center text-xs font-semibold text-primary"
            >
              {tc('seeAll')}
              <ChevronRight className="size-3.5" aria-hidden />
            </Link>
          </div>

          {categories.length > 0 ? (
            <ul className="grid grid-cols-2 gap-3">
              {collages.map((collage) => (
                <li key={collage.categorySlug}>
                  <CategoryCollageTile
                    slug={collage.categorySlug}
                    name={collage.categoryName}
                    images={collage.images}
                    moreCount={collage.moreCount}
                  />
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-[var(--radius)] border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
              {t('emptyCatalogue')}
            </p>
          )}
        </section>

        {bestsellers.length > 0 && (
          <section aria-labelledby="bestsellers-heading" className="mb-8">
            <div className="mb-3 flex items-baseline justify-between">
              <h2 id="bestsellers-heading" className="text-[17px] font-bold">
                {t('bestsellers')}
              </h2>
              <Link
                href="/category/vegetables"
                className="flex items-center text-xs font-semibold text-primary"
              >
                {tc('seeAll')}
                <ChevronRight className="size-3.5" aria-hidden />
              </Link>
            </div>

            {/* A horizontal rail, not a 2-column grid: the reference shows
                four narrow cards side by side that scroll sideways, which
                keeps "Top Picks" one glanceable row instead of a block that
                pushes everything below it off the screen. */}
            <ul className="-mx-4 flex snap-x snap-mandatory gap-2.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {bestsellers.map((product) => (
                <li key={product.id} className="w-[42vw] max-w-[168px] shrink-0 snap-start">
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
          </section>
        )}

        <FastDeliveryBanner />
      </main>
    </>
  );
}

/**
 * The welcome banner: a real, non-hard-coded product-photo cluster (the
 * catalogue's own vegetable photos, not a stock hero image) on a soft
 * green-to-yellow field, matching the client's own reference exactly — the
 * Marathi headline and delivery badge on the left, photos on the right.
 *
 * This is the FALLBACK, shown only while the admin has not uploaded a real
 * promotional banner yet (`ImageBanner` below is what renders once they do).
 */
function HeroBanner({
  headline,
  subtitle,
  badge,
  images,
}: {
  headline: string;
  subtitle: string;
  badge: string;
  images: string[];
}) {
  return (
    <div
      className="relative flex h-40 items-center overflow-hidden rounded-[var(--radius)] border border-primary/10 px-5"
      style={{
        background: 'linear-gradient(120deg, var(--brand-tint-green) 0%, var(--brand-tint-yellow) 100%)',
      }}
    >
      <Leaf
        aria-hidden
        className="pointer-events-none absolute -top-4 -left-4 size-20 -rotate-12 text-primary/15"
      />

      <div className="relative z-10 min-w-0 flex-1">
        <p className="text-xl leading-[1.15] font-black whitespace-pre-line text-primary-dark">
          {headline}
        </p>
        <p className="mt-1.5 text-[11px] font-semibold text-muted-foreground">{subtitle}</p>
        <span className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-primary-dark px-2.5 py-1.5 text-[11px] font-bold text-white">
          <Bike className="size-3.5" aria-hidden />
          {badge}
        </span>
      </div>

      {images.length > 0 && (
        <div className="relative ml-2 flex h-full shrink-0 items-center" style={{ width: '38%' }}>
          {images.map((src, index) => (
            <div
              key={src}
              className="absolute size-[88px] overflow-hidden rounded-2xl border-2 border-background shadow-md"
              style={{
                right: `${index * 26}px`,
                top: `${index % 2 === 0 ? 4 : 22}px`,
                zIndex: images.length - index,
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="" className="size-full object-cover" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * The four-up trust strip: 100% Fresh & Natural / Home Delivery / Farm to
 * Home / Healthy Choice, one card with dividers, matching the reference.
 * Static copy, not catalogue data — these are brand claims, not facts a
 * database query produces.
 */
async function BenefitsRow() {
  const t = await getTranslations('home');

  const items = [
    { icon: Sprout, titleKey: 'benefitsFreshTitle', bodyKey: 'benefitsFreshBody' },
    { icon: Truck, titleKey: 'benefitsDeliveryTitle', bodyKey: 'benefitsDeliveryBody' },
    { icon: Leaf, titleKey: 'benefitsFarmTitle', bodyKey: 'benefitsFarmBody' },
    { icon: Heart, titleKey: 'benefitsHealthyTitle', bodyKey: 'benefitsHealthyBody' },
  ] as const;

  return (
    <div className="mb-6 grid grid-cols-4 divide-x divide-border rounded-[var(--radius)] bg-card py-4 shadow-sm">
      {items.map(({ icon: Icon, titleKey, bodyKey }) => (
        <div key={titleKey} className="flex flex-col items-center gap-1.5 px-1 text-center">
          <span className="grid size-9 place-items-center rounded-full bg-tint-green text-primary">
            <Icon className="size-4.5" aria-hidden />
          </span>
          <p className="text-[11px] leading-tight font-bold">
            {t(titleKey)}
            <br />
            {t(bodyKey)}
          </p>
        </div>
      ))}
    </div>
  );
}

/** The closing promotional strip, above the bottom nav. */
async function FastDeliveryBanner() {
  const t = await getTranslations('home');

  return (
    <div className="relative flex items-center gap-3 overflow-hidden rounded-[var(--radius)] bg-tint-green px-4 py-4">
      <span className="grid size-12 shrink-0 place-items-center rounded-full bg-primary-dark text-white">
        <Bike className="size-6" aria-hidden />
      </span>

      <div className="min-w-0 flex-1">
        <p className="text-sm font-black">
          {t('fastDeliveryTitle')} · {t('fastDeliverySubtitle')}
        </p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">{t('fastDeliveryBody')}</p>
      </div>

      <Link
        href="/category/vegetables"
        className="flex shrink-0 items-center gap-1 rounded-full bg-primary-dark px-3.5 py-2 text-xs font-bold text-white"
      >
        {t('shopNow')}
        <ChevronRight className="size-3.5" aria-hidden />
      </Link>
    </div>
  );
}
