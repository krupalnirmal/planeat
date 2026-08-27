'use client';

import { ChevronDown, LayoutGrid, Leaf, Search, X, Zap } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, useState } from 'react';
import { SUBGROUP_TILE_IMAGES } from '@/lib/catalog/subgroup-tile-images';
import { CATEGORY_SUBGROUPS, vegetableTypeLabel } from '@/lib/catalog/vegetable-types';
import type { AppLocale } from '@/i18n/routing';
import { cn } from '@/lib/utils';
import { ProductCard, type ProductCardData } from './product-card';
import type { ProductRowVariant } from './product-row';

export interface CategoryProduct extends ProductCardData {
  vegetableType: string | null;
  variants: ProductRowVariant[];
}

// Categories with copy in the `categories.banner.*` messages — a category
// slug added later without a translation just gets no hero rather than a
// raw missing-message string.
const BANNER_SLUGS = new Set(['vegetables', 'fruits', 'dairy', 'bakery-biscuits', 'ice-cream', 'grocery']);

/**
 * Hides the category hero on every category page (client asked for it off
 * for now, session 2026-08-27). Flip to `true` to bring it back — the
 * banner, its copy in `categories.banner.*` and its animations are all
 * still here, so this is the only line that needs changing.
 */
const SHOW_CATEGORY_HERO = false;

type SortOption = 'default' | 'priceAsc' | 'priceDesc' | 'nameAsc';
type PillId = 'filters' | 'sort' | 'type' | 'price';

const SORT_OPTIONS: Array<{
  value: SortOption;
  labelKey: 'sortDefault' | 'sortPriceAsc' | 'sortPriceDesc' | 'sortNameAsc';
}> = [
  { value: 'default', labelKey: 'sortDefault' },
  { value: 'priceAsc', labelKey: 'sortPriceAsc' },
  { value: 'priceDesc', labelKey: 'sortPriceDesc' },
  { value: 'nameAsc', labelKey: 'sortNameAsc' },
];

// Roughly this screen's own sticky header's height — sections need the same
// amount of top scroll-margin so "jump to section" doesn't land underneath
// it, and the sidebar sticks exactly where the header ends, not under it.
const HEADER_OFFSET_PX = 68;

// Each sub-type section previews this many products before "See all" —
// a category page is an overview of every sub-type, not the place to
// scroll through all 9 fruit-vegetable products at once.
// 4, not 2: a 2-column grid makes a 2-item preview exactly one row, which
// read as stingier than the old list's 2-row preview did.
const GROUP_PREVIEW_COUNT = 4;

// Blinkit's rail always leads with a non-photo "All" tab, active by
// default, that just scrolls back to the top of the whole list — it is
// not one of the real sub-groups, so it needs an id no real group can
// collide with.
const ALL_ID = '__all__';

/**
 * One of the toolbar's pill triggers (session 2026-08-26, client's
 * reference: Filters / Sort / Type / Price, not a text search field). Just
 * the button — the pills row scrolls horizontally (`overflow-x-auto`),
 * and a dropdown panel positioned `absolute` *inside* a scrolling
 * container gets its bottom half clipped (setting `overflow-x` forces the
 * other axis to compute as `auto` too, per spec, no matter what
 * `overflow-y` says). The open pill's panel is rendered by the parent
 * instead, outside the scrolling row — see `openPill` below.
 */
function FilterPillButton({
  label,
  isOpen,
  onToggle,
}: {
  label: string;
  isOpen: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={isOpen}
      className="flex h-10 shrink-0 items-center gap-1 rounded-full border border-border bg-card px-3.5 text-[13px] font-semibold whitespace-nowrap"
    >
      {label}
      <ChevronDown className={cn('size-3.5 transition-transform', isOpen && 'rotate-180')} aria-hidden />
    </button>
  );
}

function FilterPillOption({
  label,
  active,
  onSelect,
}: {
  label: string;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'block w-full px-3 py-2.5 text-left text-sm whitespace-nowrap',
        active ? 'font-bold text-primary' : 'text-foreground',
      )}
    >
      {label}
    </button>
  );
}

/**
 * The reference's list-row category screen: an in-page search that filters
 * the products already on the page (a category comfortably fits on one
 * load, per the pagination above), plus a real sort menu standing in for
 * the reference's "Filter" button — no fake filter facets the catalogue
 * cannot actually answer.
 *
 * When the category has sub-type groups (vegetables today), the client
 * asked for a Blinkit-style two-pane layout: a sticky left rail of the
 * groups, tapping one jumps the right list to that section, and scrolling
 * the right list updates which rail item reads as selected — the two stay
 * in sync in either direction, not just tap-to-scroll.
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
  // The delivery promise lives under `home`, where the header already uses
  // it — repeating the string under `categories` would be two copies of
  // one fact to keep in sync across three locales.
  const th = useTranslations('home');

  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [sort, setSort] = useState<SortOption>('default');
  const [inStockOnly, setInStockOnly] = useState(false);
  const [openPill, setOpenPill] = useState<PillId | null>(null);
  const [activeTypeId, setActiveTypeId] = useState<string | null>(null);
  const [expandedTypes, setExpandedTypes] = useState<Set<string>>(() => new Set());

  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});

  function toggleExpanded(typeId: string) {
    setExpandedTypes((prev) => {
      const next = new Set(prev);
      if (next.has(typeId)) next.delete(typeId);
      else next.add(typeId);
      return next;
    });
  }

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return products.filter((p) => {
      if (term && !p.name.toLowerCase().includes(term)) return false;
      if (inStockOnly && !p.inStock) return false;
      return true;
    });
  }, [products, query, inStockOnly]);

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

  // A small real-photo cluster for the hero banner below — the catalogue's
  // own images, not stock art, same reasoning as the home banners' produce
  // circles (scripts/generate-banners.mjs).
  const bannerPhotos = useMemo(
    () => [...new Set(products.map((p) => p.imageUrl).filter((url): url is string => !!url))].slice(0, 3),
    [products],
  );

  // Grouping applies to any category with a real sub-group breadth (see
  // CATEGORY_SUBGROUPS) — kept for the default view, but a search collapses
  // to one flat, easy-to-scan list rather than making someone hunt across
  // sub-groups for a match.
  const searching = query.trim().length > 0;
  const subgroupTypes = CATEGORY_SUBGROUPS[slug] ?? null;
  const groups =
    !searching && subgroupTypes
      ? subgroupTypes
          .map((type) => ({
            type,
            products: sorted.filter((p) => p.vegetableType === type.id),
          }))
          .filter((group) => group.products.length > 0)
      : null;
  const rest = groups ? sorted.filter((p) => !p.vegetableType) : sorted;

  // Default the rail's active item to the first group the moment groups
  // become available — done during render (React's documented pattern for
  // "adjust state when a dependency changes"), not in the effect below,
  // which is reserved for the actual scroll-driven IntersectionObserver.
  const groupsKey = groups?.map((g) => g.type.id).join(',') ?? '';
  const [seenGroupsKey, setSeenGroupsKey] = useState('');
  if (groupsKey !== seenGroupsKey) {
    setSeenGroupsKey(groupsKey);
    setActiveTypeId(groups ? ALL_ID : null);
  }

  // Scroll-spy: whichever section is nearest the top of the visible area
  // (just below the sticky header/rail) is the one that reads as selected
  // on the left, whether the customer tapped a rail item or just scrolled.
  useEffect(() => {
    if (!groups || groups.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        const topId = visible[0]?.target.getAttribute('data-type-id');
        if (topId) setActiveTypeId(topId);
      },
      { rootMargin: `-${HEADER_OFFSET_PX + 8}px 0px -65% 0px`, threshold: 0 },
    );

    for (const group of groups) {
      const el = sectionRefs.current[group.type.id];
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
    // Re-observe whenever the set of visible groups changes (sort/filter).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups?.map((g) => g.type.id).join(',')]);

  function closeSearch() {
    setSearchOpen(false);
    setQuery('');
  }

  function jumpTo(typeId: string) {
    setActiveTypeId(typeId);
    sectionRefs.current[typeId]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function jumpToTop() {
    setActiveTypeId(ALL_ID);
    const firstGroupId = groups?.[0]?.type.id;
    if (firstGroupId) {
      sectionRefs.current[firstGroupId]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  return (
    <>
      <h1 className="bg-tint-lime px-4 pt-3 text-xl leading-tight font-black text-foreground">
        {categoryName}
      </h1>

      <div className="relative bg-tint-lime px-4 pt-2 pb-2">
        <div className="flex items-center gap-2">
          {/* Search collapses to an icon by default (session 2026-08-26,
              client's reference: the toolbar is pills, not a text field) —
              tapping it swaps the pill row for the same search input this
              page always had, rather than losing in-page search entirely. */}
          <button
            type="button"
            onClick={() => {
              setOpenPill(null);
              if (searchOpen) closeSearch();
              else setSearchOpen(true);
            }}
            aria-expanded={searchOpen}
            aria-label={t('search')}
            className="grid size-10 shrink-0 place-items-center rounded-full border border-border bg-card"
          >
            <Search className="size-4 text-muted-foreground" aria-hidden />
          </button>

          {searchOpen ? (
            <div className="input-3d flex h-10 flex-1 items-center gap-2 rounded-[var(--radius)] bg-background px-3">
              <input
                type="search"
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t('searchPlaceholder', { category: categoryName })}
                aria-label={t('searchPlaceholder', { category: categoryName })}
                className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
              <button
                type="button"
                onClick={closeSearch}
                aria-label={tc('close')}
                className="grid size-6 shrink-0 place-items-center text-muted-foreground"
              >
                <X className="size-3.5" aria-hidden />
              </button>
            </div>
          ) : (
            <div className="flex flex-1 gap-2 overflow-x-auto">
              <FilterPillButton
                label={t('pillFilters')}
                isOpen={openPill === 'filters'}
                onToggle={() => setOpenPill((p) => (p === 'filters' ? null : 'filters'))}
              />
              <FilterPillButton
                label={t('pillSort')}
                isOpen={openPill === 'sort'}
                onToggle={() => setOpenPill((p) => (p === 'sort' ? null : 'sort'))}
              />
              {subgroupTypes && (
                <FilterPillButton
                  label={t('pillType')}
                  isOpen={openPill === 'type'}
                  onToggle={() => setOpenPill((p) => (p === 'type' ? null : 'type'))}
                />
              )}
              <FilterPillButton
                label={t('pillPrice')}
                isOpen={openPill === 'price'}
                onToggle={() => setOpenPill((p) => (p === 'price' ? null : 'price'))}
              />
            </div>
          )}
        </div>

        {/* The open pill's panel, rendered here rather than inside the
            scrolling pills row above — see FilterPillButton's comment. */}
        {openPill && (
          <>
            <button
              type="button"
              aria-label={tc('close')}
              onClick={() => setOpenPill(null)}
              className="fixed inset-0 z-10 cursor-default"
            />
            <div className="absolute top-full left-4 z-20 mt-1 max-h-64 min-w-40 overflow-y-auto rounded-[var(--radius)] border border-border bg-card py-1 shadow-lg">
              {openPill === 'filters' &&
                [
                  { value: false, label: t('all') },
                  { value: true, label: t('inStockOnly') },
                ].map((option) => (
                  <FilterPillOption
                    key={String(option.value)}
                    label={option.label}
                    active={inStockOnly === option.value}
                    onSelect={() => {
                      setInStockOnly(option.value);
                      setOpenPill(null);
                    }}
                  />
                ))}

              {openPill === 'sort' &&
                SORT_OPTIONS.map((option) => (
                  <FilterPillOption
                    key={option.value}
                    label={t(option.labelKey)}
                    active={sort === option.value}
                    onSelect={() => {
                      setSort(option.value);
                      setOpenPill(null);
                    }}
                  />
                ))}

              {openPill === 'type' &&
                subgroupTypes?.map((type) => (
                  <FilterPillOption
                    key={type.id}
                    label={vegetableTypeLabel(type, locale)}
                    active={activeTypeId === type.id}
                    onSelect={() => {
                      jumpTo(type.id);
                      setOpenPill(null);
                    }}
                  />
                ))}

              {openPill === 'price' &&
                (
                  [
                    { value: 'priceAsc', label: t('priceLowToHigh') },
                    { value: 'priceDesc', label: t('priceHighToLow') },
                  ] as const
                ).map((option) => (
                  <FilterPillOption
                    key={option.value}
                    label={option.label}
                    active={sort === option.value}
                    onSelect={() => {
                      setSort(option.value);
                      setOpenPill(null);
                    }}
                  />
                ))}
            </div>
          </>
        )}
      </div>

      {/* Hero banner (session 2026-08-26, client's reference): a headline
          and a small cluster of the category's own product photos, sitting
          directly on the page tint rather than a separate card — no fake
          per-category creative to design or keep in sync, since it's built
          from whatever's already in the catalogue. Sits above the grid,
          matching the reference; a search collapses it along with the
          sub-group rail, same reasoning as `groups` below. */}
      {SHOW_CATEGORY_HERO && !searching && sorted.length > 0 && BANNER_SLUGS.has(slug) && (
        <div className="bg-tint-lime px-4 pt-1 pb-4">
          <div className="animate-in fade-in slide-in-from-bottom-2 relative overflow-hidden rounded-[var(--radius)] bg-gradient-to-br from-[#eaf7d4] via-[#f2fadf] to-[#fdf6e6] px-4 py-5 shadow-sm duration-500">
            {/* Two soft colour pools behind everything, so the gradient
                reads as depth rather than as a flat two-tone fill. */}
            <span
              aria-hidden
              className="pointer-events-none absolute -top-10 -left-8 size-36 rounded-full bg-primary/15 blur-3xl"
            />
            <span
              aria-hidden
              className="pointer-events-none absolute -right-6 -bottom-12 size-32 rounded-full bg-accent/20 blur-3xl"
            />

            {/* Leaves drifting behind the copy. Decorative only — aria-hidden,
                and stilled entirely under prefers-reduced-motion. */}
            {[
              { cls: 'top-2 left-[52%] size-4', delay: '0s' },
              { cls: 'top-9 left-[70%] size-3', delay: '1.6s' },
              { cls: 'bottom-3 left-[60%] size-3.5', delay: '3.1s' },
            ].map((leaf) => (
              <Leaf
                key={leaf.cls}
                aria-hidden
                style={{ animationDelay: leaf.delay }}
                className={cn(
                  'animate-hero-drift pointer-events-none absolute text-primary/40',
                  leaf.cls,
                )}
              />
            ))}

            <div className="relative flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <h2 className="text-[19px] leading-tight font-black text-primary-dark drop-shadow-sm">
                  {t(`banner.${slug}.headline`)}
                </h2>
                <p className="mt-1 text-[13px] leading-snug font-medium text-foreground/70">
                  {t(`banner.${slug}.sub`)}
                </p>
                <span className="mt-2.5 inline-flex items-center gap-1 rounded-full bg-primary-dark px-2.5 py-1 text-[11px] font-bold text-white">
                  <Zap className="size-3 fill-white" aria-hidden />
                  {th('deliveryIn', { minutes: 30 })}
                </span>
              </div>

              {/* The catalogue's own photos, overlapped and gently bobbing on
                  a stagger so they don't move as one block. */}
              {bannerPhotos.length > 0 && (
                <div className="flex shrink-0 -space-x-4" aria-hidden>
                  {bannerPhotos.map((url, i) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={url}
                      src={url}
                      alt=""
                      className="animate-hero-float size-[68px] rounded-full border-[3px] border-white/90 object-cover shadow-lg"
                      style={{
                        animationDelay: `${i * 0.8}s`,
                        zIndex: bannerPhotos.length - i,
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {sorted.length === 0 ? (
        <div className="bg-tint-lime px-4 pb-4">
          <p className="rounded-[var(--radius)] border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
            {t('empty')}
          </p>
        </div>
      ) : groups ? (
        <div className="flex items-start gap-0">
          {/* Left rail — sticks right under the page's own sticky header.
              Restyled (session 2026-08-26) to the client's reference: round
              photo tiles and a bold label for the active item, no left-edge
              colour bar or per-group count. */}
          <nav
            aria-label={categoryName}
            className="sticky w-[76px] shrink-0 self-start overflow-y-auto bg-card"
            style={{ top: HEADER_OFFSET_PX, maxHeight: `calc(100dvh - ${HEADER_OFFSET_PX}px)` }}
          >
            {/* The rail always leads with a non-photo "All" tab, active by
                default — a plain icon glyph, not a catalogue photo, since it
                doesn't represent any one sub-group. */}
            <button
              type="button"
              onClick={jumpToTop}
              aria-current={activeTypeId === ALL_ID}
              className={cn(
                'flex w-full flex-col items-center gap-1 border-r-4 px-1.5 py-3 text-center',
                activeTypeId === ALL_ID ? 'border-primary' : 'border-transparent',
              )}
            >
              <span
                className={cn(
                  'grid size-14 shrink-0 place-items-center rounded-full',
                  activeTypeId === ALL_ID ? 'bg-tint-lime text-primary' : 'bg-background text-muted-foreground',
                )}
                aria-hidden
              >
                <LayoutGrid className="size-5" aria-hidden />
              </span>
              <span
                className={cn(
                  'text-[11px] leading-tight',
                  activeTypeId === ALL_ID ? 'font-bold text-foreground' : 'font-medium text-foreground',
                )}
              >
                {t('all')}
              </span>
            </button>

            {groups.map(({ type, products: groupProducts }) => {
              const active = activeTypeId === type.id;
              // Blinkit-matched (session 2026-08-25): a real photo, not an
              // emoji glyph. A curated client photo (SUBGROUP_TILE_IMAGES)
              // wins over whichever product happens to be first in the group.
              const thumbUrl =
                SUBGROUP_TILE_IMAGES[type.id] ?? groupProducts[0]?.imageUrl ?? null;
              return (
                <button
                  key={type.id}
                  type="button"
                  onClick={() => jumpTo(type.id)}
                  aria-current={active}
                  className={cn(
                    'flex w-full flex-col items-center gap-1 border-r-4 px-1.5 py-3 text-center',
                    active ? 'border-primary' : 'border-transparent',
                  )}
                >
                  <span
                    className={cn(
                      'grid size-14 shrink-0 place-items-center overflow-hidden rounded-full p-1',
                      active ? 'bg-tint-lime' : 'bg-background',
                    )}
                    aria-hidden
                  >
                    {thumbUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={thumbUrl} alt="" className="size-full rounded-full object-cover" />
                    ) : (
                      <span className="text-lg">{type.emoji}</span>
                    )}
                  </span>
                  <span
                    className={cn(
                      'text-[11px] leading-tight',
                      active ? 'font-bold text-foreground' : 'font-medium text-foreground',
                    )}
                  >
                    {vegetableTypeLabel(type, locale)}
                  </span>
                </button>
              );
            })}
          </nav>

          {/* Right pane — the actual scrolling list; the rail above just
              rides along with the page's normal scroll via `sticky`. The
              tint (session 2026-08-26, client's reference) is what makes
              the white cards read as cards instead of blending into the
              page — the rail stays white so it still reads as its own
              column. */}
          <div className="min-w-0 flex-1 bg-tint-lime">
            {groups.map(({ type, products: groupProducts }) => {
              const expanded = expandedTypes.has(type.id);
              const visibleProducts = expanded
                ? groupProducts
                : groupProducts.slice(0, GROUP_PREVIEW_COUNT);
              const hasMore = groupProducts.length > GROUP_PREVIEW_COUNT;

              return (
                <section
                  key={type.id}
                  ref={(el) => {
                    sectionRefs.current[type.id] = el;
                  }}
                  data-type-id={type.id}
                  style={{ scrollMarginTop: HEADER_OFFSET_PX + 8 }}
                  className="pb-2"
                >
                  {/* Sticky within its own section: pinned while its products
                      scroll past, then swapped for the next section's own
                      heading — an unmistakable "you're in a new sub-category
                      now" signal, not just bold text sitting in the list. */}
                  <h2
                    className="sticky z-10 flex items-center gap-2 border-b border-border bg-tint-lime px-4 py-2.5"
                    style={{ top: HEADER_OFFSET_PX }}
                  >
                    <span
                      className="grid size-7 shrink-0 place-items-center overflow-hidden rounded-[calc(var(--radius)-8px)] bg-card p-0.5 shadow-sm"
                      aria-hidden
                    >
                      {(SUBGROUP_TILE_IMAGES[type.id] ?? groupProducts[0]?.imageUrl) ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={SUBGROUP_TILE_IMAGES[type.id] ?? groupProducts[0].imageUrl!}
                          alt=""
                          className="size-full rounded-[3px] object-cover"
                        />
                      ) : (
                        <span className="text-base">{type.emoji}</span>
                      )}
                    </span>
                    <span className="flex-1 text-[15px] font-black text-primary-dark">
                      {vegetableTypeLabel(type, locale)}
                    </span>
                    {hasMore && (
                      <button
                        type="button"
                        onClick={() => toggleExpanded(type.id)}
                        className="text-xs font-bold text-primary"
                      >
                        {expanded ? tc('showLess') : tc('seeAll')}
                      </button>
                    )}
                  </h2>
                  <div className="grid grid-cols-2 gap-3 px-4 pt-3 pb-3">
                    {visibleProducts.map((product) => (
                      <ProductCard key={product.id} product={product} variants={product.variants} />
                    ))}
                  </div>
                </section>
              );
            })}
            {rest.length > 0 && (
              <section className="pb-2">
                <h2
                  className="sticky z-10 border-b border-border bg-tint-lime px-4 py-2.5 text-[15px] font-black text-primary-dark"
                  style={{ top: HEADER_OFFSET_PX }}
                >
                  {t('other')}
                </h2>
                <div className="grid grid-cols-2 gap-3 px-4 pt-3 pb-3">
                  {rest.map((product) => (
                    <ProductCard key={product.id} product={product} variants={product.variants} />
                  ))}
                </div>
              </section>
            )}
          </div>
        </div>
      ) : (
        <div className="bg-tint-lime px-4 pt-3 pb-3">
          <div className="grid grid-cols-2 gap-3">
            {rest.map((product) => (
              <ProductCard key={product.id} product={product} variants={product.variants} />
            ))}
          </div>
        </div>
      )}
    </>
  );
}
