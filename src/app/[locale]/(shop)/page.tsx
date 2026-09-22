import { Bike, ChevronRight } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { AppHeader } from '@/components/shop/app-header';
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
            hero as THE brand moment. A secondary `BannerCarousel` strip
            used to render right below it, but the client asked for a
            single banner only (session 2026-09-23) — admin-uploaded
            promo banners no longer render on this page. */}
        <div className="space-y-2 px-4 pt-2">
          <HeroBanner />
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
 * The welcome banner (session 2026-09-23, client feedback — the rebuilt
 * headline/photo split "didn't match the design"). Renders the client's
 * own reference banner PNGs as-is (`public/brand/hero-banner-desktop.png`
 * / `-mobile.png`, straight copies of their `getfresh_customer_*_hero_
 * banner.png` files — no crop/recompose this time) instead of recreating
 * the layout in HTML. The banner art has its own headline/CTA copy and
 * feature-icon row baked in, so two real `Link`s are laid over the "Shop
 * Fresh"/"Explore Categories" buttons (transparent, positioned by
 * percentage over their baked-in position) to keep real navigation working
 * — everything else in the image is non-interactive decoration.
 *
 * Trade-off worth knowing: the baked-in copy is English-only text inside a
 * PNG, so mr/hi locales will see this one banner in English regardless of
 * locale (the client's own reference art has no translated variant).
 *
 * Always renders (see the call site's own comment) — this is the page's
 * only banner now; admin-uploaded promo banners no longer render here.
 */
async function HeroBanner() {
  const t = await getTranslations('home');
  const alt = `${t('heroHeadline').replace(/\n/g, ' ')} — ${t('heroSubtitle')}`;

  return (
    <div className="relative overflow-hidden rounded-[var(--radius-xl)] border border-primary/10">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/brand/hero-banner-mobile.png"
        alt={alt}
        className="block w-full sm:hidden"
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/brand/hero-banner-desktop.png"
        alt={alt}
        className="hidden w-full sm:block"
      />

      <Link
        href="/category/vegetables"
        aria-label={t('shopFresh')}
        className="absolute top-[56%] left-[2.5%] h-[19%] w-[19%] sm:left-[3%] sm:w-[17%]"
      />
      <Link
        href="/categories"
        aria-label={t('exploreCategories')}
        className="absolute top-[56%] left-[22.5%] h-[19%] w-[26%] sm:left-[21%]"
      />
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
