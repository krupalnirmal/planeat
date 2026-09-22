import { ArrowRight, Bike, ChevronRight, Heart, Leaf, ShieldCheck, Truck } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { AppHeader } from '@/components/shop/app-header';
import { BannerCarousel } from '@/components/shop/banner-carousel';
import { CategoryCollageTile } from '@/components/shop/category-collage-tile';
import { HomeSection } from '@/components/shop/home-section';
import { OrderAgainRow } from '@/components/shop/order-again-row';
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

  return (
    <>
      <AppHeader />

      {/* bg-page-grey (session 2026-08-27): #fafafa, sampled straight out
          of the client's reference screenshot. An earlier session put the
          category pages' green tint here instead; the reference has no
          green background at all — near-white, with the white cards on top
          carrying the structure. */}
      <main className="bg-page-grey pb-2">
        {/* `HeroBanner` is unconditional now (session 2026-09-22, new
            client reference) — it used to be the fallback shown only
            while no admin banner existed, with `BannerCarousel` taking
            the same slot whenever a real one did. This live database
            actually has real seeded banners (an earlier session's
            `scripts/seed-banners.ts`), which was silently hiding the
            client's own new hero entirely — a real bug this fix corrects,
            not a hypothetical one. The client's reference shows this exact
            hero as THE brand moment, not a placeholder to be preempted by
            whatever promotional creative happens to be uploaded. Real
            admin banners are still real, useful content, so they don't
            just disappear — they move to a secondary strip right below
            the fixed hero instead of competing for its slot. */}
        <div className="space-y-2 px-4 pt-2">
          <HeroBanner />
          {banners.length > 0 && <BannerCarousel banners={banners.slice(0, 1)} />}
        </div>

        <HomeSection
          id="categories-heading"
          title={t('categories')}
          seeAllHref="/categories"
          seeAllLabel={tc('seeAll')}
          card
        >
          {categories.length > 0 ? (
            // A horizontally-scrollable row below `lg:` (session
            // 2026-09-19, client request) — a growing category list (Aata/
            // Masala's own addition is what surfaced this) no longer
            // spills onto a second row; it scrolls in one row instead,
            // snapping one tile at a time on mobile. At `lg:` and up
            // (session 2026-09-20) scrolling chips is a mobile-only
            // affordance — it becomes a wrapping grid instead, sized to
            // the tile's own real width (`repeat(auto-fill,104px)`, not a
            // fixed column count) so it lays out evenly instead of
            // stretching each tile across a huge column.
            <ul className="flex snap-x snap-mandatory gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:grid lg:grid-cols-[repeat(auto-fill,180px)] lg:justify-center lg:gap-4 lg:overflow-visible">
              {collages.map((collage) => (
                <li key={collage.categorySlug} className="shrink-0">
                  <CategoryCollageTile
                    slug={collage.categorySlug}
                    name={collage.categoryName}
                    images={collage.images}
                  />
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-[var(--radius)] border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
              {t('emptyCatalogue')}
            </p>
          )}
        </HomeSection>

        {/* Renders nothing for a guest or a first-time buyer. */}
        <OrderAgainRow />

        {bestsellers.length > 0 && (
          <HomeSection
            id="bestsellers-heading"
            title={t('bestsellers')}
            seeAllHref="/category/vegetables"
            seeAllLabel={tc('seeAll')}
          >
            {/* A horizontal rail below `lg:`, not a 2-column grid: the
                reference shows four narrow cards side by side that scroll
                sideways, which keeps "Top Picks" one glanceable row
                instead of a block that pushes everything below it off the
                screen. */}
            {/* `scroll-px-4` matters: without it scroll-snap aligns the
                first card to the scrollport's own edge, silently scrolling
                past the `px-4` padding, so the rail started flush at x=0
                while every other section on the page starts at 16px. */}
            {/* `lg:` (session 2026-09-20): the card's own width is already
                capped at 132px by `max-w-[132px]` on the `<li>` below
                regardless of viewport, so the same "size the grid tracks
                to the card's real width" trick as the category row above
                applies here too — `repeat(auto-fill,132px)`, not a fixed
                column count. */}
            <ul className="-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-2.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:mx-0 lg:grid lg:grid-cols-[repeat(auto-fill,132px)] lg:gap-3 lg:overflow-visible lg:px-0">
              {bestsellers.map((product) => (
                <li key={product.id} className="w-[30vw] max-w-[132px] shrink-0 snap-start">
                  <ProductCard
                    product={{
                      id: product.id,
                      name: product.name,
                      nameEn: product.nameEn,
                      localName: product.localName,
                      imageUrl: product.imageUrl,
                      images: product.images,
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
                    compact
                  />
                </li>
              ))}
            </ul>
          </HomeSection>
        )}

        <div className="px-4 py-2">
          <FastDeliveryBanner />
        </div>
      </main>
    </>
  );
}

/**
 * The welcome banner (session 2026-09-22, new client reference) — the
 * catalogue-photo collage this used to show is gone in favour of the
 * client's own real hero photo, cropped from their reference image
 * (`public/brand/hero-photo.png` — the veggie-filled paper bag + the
 * decorative "Good Food Brighter Days" script and "Fresh From Farm to
 * Home" badge, all baked into that one real photo, same "crop the real
 * asset" technique this session has used for every other reference-image
 * asset). Two real CTA buttons (→ /categories) and the feature-icon strip
 * that used to be its own separate white card further down the page now
 * live inside the hero itself, matching the reference's layout — one hero
 * section doing the full job instead of two.
 *
 * Always renders now (see the call site's own comment on why this
 * stopped being conditional on whether an admin banner exists) — real
 * admin-uploaded banners (`BannerCarousel`) still show, just as a
 * secondary strip below this fixed hero rather than competing for its
 * slot.
 */
async function HeroBanner() {
  const t = await getTranslations('home');

  const features = [
    { icon: Leaf, titleKey: 'benefitsFreshTitle', bodyKey: 'benefitsFreshBody' },
    { icon: Truck, titleKey: 'benefitsDeliveryTitle', bodyKey: 'benefitsDeliveryBody' },
    { icon: ShieldCheck, titleKey: 'benefitsFarmTitle', bodyKey: 'benefitsFarmBody' },
    { icon: Heart, titleKey: 'benefitsHealthyTitle', bodyKey: 'benefitsHealthyBody' },
  ] as const;

  return (
    <div
      className="relative overflow-hidden rounded-[var(--radius-xl)] border border-primary/10 px-5 py-5 lg:flex lg:items-center lg:gap-8 lg:px-10 lg:py-8"
      style={{
        background: 'linear-gradient(120deg, var(--brand-tint-green) 0%, var(--brand-tint-yellow) 100%)',
      }}
    >
      <Leaf
        aria-hidden
        className="pointer-events-none absolute -top-4 -left-4 size-20 -rotate-12 text-primary/15"
      />

      <div className="relative z-10 min-w-0 flex-1">
        <p className="text-xl leading-[1.15] font-black whitespace-pre-line text-navy lg:text-4xl">
          {t('heroHeadline')}
        </p>
        <p className="mt-2 text-xs text-muted-foreground lg:mt-3 lg:max-w-md lg:text-sm">
          {t('heroSubtitle')}
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-2.5">
          <Link
            href="/category/vegetables"
            className="flex items-center gap-1.5 rounded-full bg-primary px-4 py-2.5 text-xs font-bold text-primary-foreground lg:text-sm"
          >
            {t('shopFresh')}
            <ArrowRight className="size-3.5" aria-hidden />
          </Link>
          <Link
            href="/categories"
            className="rounded-full border border-primary bg-card px-4 py-2.5 text-xs font-bold text-primary lg:text-sm"
          >
            {t('exploreCategories')}
          </Link>
        </div>

        {/* The feature-icon strip used to be its own separate white card
            further down the page — merged into the hero here to match the
            reference, which shows it directly under the CTA buttons. */}
        <div className="mt-5 hidden gap-5 sm:flex">
          {features.map((feature) => (
            <div key={feature.titleKey} className="flex items-center gap-2">
              <feature.icon className="size-4 shrink-0 text-primary" aria-hidden />
              <p className="text-[11px] leading-tight font-bold whitespace-nowrap">
                {t(feature.titleKey)}
                <br />
                {t(feature.bodyKey)}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* The client's own real hero photo (see this function's doc
          comment) — hidden below `sm:` rather than shrunk illegibly small;
          the headline/subtitle/CTAs above already carry the hero's job on
          a narrow phone. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/brand/hero-photo.png"
        alt=""
        aria-hidden
        className="relative z-10 mt-4 hidden w-full rounded-[var(--radius-lg)] object-cover sm:block lg:mt-0 lg:h-72 lg:w-auto lg:shrink-0"
      />

      {/* Mobile-only compact feature row (below the hero, not inside it —
          the hero above is already tight at phone width). */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:hidden">
        {features.map((feature) => (
          <div key={feature.titleKey} className="flex items-center gap-2">
            <feature.icon className="size-4 shrink-0 text-primary" aria-hidden />
            <p className="text-[10px] leading-tight font-bold">
              {t(feature.titleKey)}
              <br />
              {t(feature.bodyKey)}
            </p>
          </div>
        ))}
      </div>
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

      {/* R10 — a plain <a> doesn't pick up the global 44px-touch-target rule
          (that only targets `button`/`a[role="button"]`), so this was
          quietly under the floor despite looking fine. */}
      <Link
        href="/category/vegetables"
        role="button"
        className="flex shrink-0 items-center gap-1 rounded-full bg-primary-dark px-3.5 py-2 text-xs font-bold text-white"
      >
        {t('shopNow')}
        <ChevronRight className="size-3.5" aria-hidden />
      </Link>
    </div>
  );
}
