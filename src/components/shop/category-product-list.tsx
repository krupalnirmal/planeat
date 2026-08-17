'use client';

import { Filter, Search, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, useState } from 'react';
import { vegetableTypeLabel, VEGETABLE_TYPES } from '@/lib/catalog/vegetable-types';
import type { AppLocale } from '@/i18n/routing';
import { cn } from '@/lib/utils';
import type { ProductCardData } from './product-card';
import { ProductRow, type ProductRowVariant } from './product-row';

export interface CategoryProduct extends ProductCardData {
  vegetableType: string | null;
  variants: ProductRowVariant[];
}

// Client-supplied (public/banners/category_banner.png) — its copy ("Fresh
// vegetables, delivered daily") only makes sense on this one category, so
// it isn't a generic per-category banner slot.
const VEGETABLES_BANNER_URL =
  'https://res.cloudinary.com/kf9nvvpv/image/upload/v1786779984/planeat/banners/category-banner.jpg';

type SortOption = 'default' | 'priceAsc' | 'priceDesc' | 'nameAsc';

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
const GROUP_PREVIEW_COUNT = 2;

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

  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortOption>('default');
  const [sortOpen, setSortOpen] = useState(false);
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
    return term ? products.filter((p) => p.name.toLowerCase().includes(term)) : products;
  }, [products, query]);

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

  // Grouping is a separate, earlier client request (vegetables only) — kept
  // for the default view, but a search collapses to one flat, easy-to-scan
  // list rather than making someone hunt across sub-groups for a match.
  const searching = query.trim().length > 0;
  const groups =
    !searching && slug === 'vegetables'
      ? VEGETABLE_TYPES.map((type) => ({
          type,
          products: sorted.filter((p) => p.vegetableType === type.id),
        })).filter((group) => group.products.length > 0)
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
    setActiveTypeId(groups?.[0]?.type.id ?? null);
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

  function jumpTo(typeId: string) {
    setActiveTypeId(typeId);
    sectionRefs.current[typeId]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <>
      <div className="flex items-center gap-2 bg-card px-4 pt-3 pb-2">
        <div className="input-3d flex h-11 flex-1 items-center gap-2 rounded-[var(--radius)] bg-background px-3">
          <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('searchPlaceholder', { category: categoryName })}
            aria-label={t('searchPlaceholder', { category: categoryName })}
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label={tc('close')}
              className="grid size-6 shrink-0 place-items-center text-muted-foreground"
            >
              <X className="size-3.5" aria-hidden />
            </button>
          )}
        </div>

        <div className="relative shrink-0">
          <button
            type="button"
            onClick={() => setSortOpen((open) => !open)}
            aria-expanded={sortOpen}
            className="flex h-11 items-center gap-1.5 rounded-[var(--radius)] border border-border px-3 text-sm font-semibold"
          >
            <Filter className="size-4" aria-hidden />
            {t('filter')}
          </button>

          {sortOpen && (
            <>
              <button
                type="button"
                aria-label={tc('close')}
                onClick={() => setSortOpen(false)}
                className="fixed inset-0 z-10 cursor-default"
              />
              <div className="absolute top-full right-0 z-20 mt-1 w-48 overflow-hidden rounded-[var(--radius)] border border-border bg-card py-1 shadow-lg">
                {SORT_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => {
                      setSort(option.value);
                      setSortOpen(false);
                    }}
                    className={cn(
                      'block w-full px-3 py-2.5 text-left text-sm',
                      sort === option.value ? 'font-bold text-primary' : 'text-foreground',
                    )}
                  >
                    {t(option.labelKey)}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {slug === 'vegetables' && !searching && (
        <div className="bg-card px-4 pb-3">
          <div className="overflow-hidden rounded-[var(--radius)] shadow-sm">
            {/* Whole creative, never cropped — same rule as the home
                carousel's banners. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={VEGETABLES_BANNER_URL}
              alt={t('vegetablesBannerAlt')}
              className="block h-auto w-full"
            />
          </div>
        </div>
      )}

      {sorted.length === 0 ? (
        <div className="bg-card px-4 pb-4">
          <p className="rounded-[var(--radius)] border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
            {t('empty')}
          </p>
        </div>
      ) : groups ? (
        <div className="flex items-start gap-0 bg-card">
          {/* Left rail — sticks right under the page's own sticky header. */}
          <nav
            aria-label={categoryName}
            className="sticky w-[76px] shrink-0 self-start overflow-y-auto border-r border-border"
            style={{ top: HEADER_OFFSET_PX, maxHeight: `calc(100dvh - ${HEADER_OFFSET_PX}px)` }}
          >
            {groups.map(({ type, products: groupProducts }) => {
              const active = activeTypeId === type.id;
              return (
                <button
                  key={type.id}
                  type="button"
                  onClick={() => jumpTo(type.id)}
                  aria-current={active}
                  className={cn(
                    'flex w-full flex-col items-center gap-1 border-l-4 px-1.5 py-3 text-center',
                    active ? 'border-primary bg-tint-green' : 'border-transparent',
                  )}
                >
                  <span
                    className={cn(
                      'grid size-10 shrink-0 place-items-center rounded-full text-lg',
                      active ? 'bg-card shadow-sm' : 'bg-background',
                    )}
                    aria-hidden
                  >
                    {type.emoji}
                  </span>
                  <span
                    className={cn(
                      'text-[10.5px] leading-tight',
                      active ? 'font-bold text-primary-dark' : 'font-medium text-muted-foreground',
                    )}
                  >
                    {vegetableTypeLabel(type, locale)}
                  </span>
                  <span className="text-[9px] text-muted-foreground">{groupProducts.length}</span>
                </button>
              );
            })}
          </nav>

          {/* Right pane — the actual scrolling list; the rail above just
              rides along with the page's normal scroll via `sticky`. */}
          <div className="min-w-0 flex-1">
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
                    className="sticky z-10 flex items-center gap-2 border-b border-border bg-tint-green px-4 py-2.5"
                    style={{ top: HEADER_OFFSET_PX }}
                  >
                    <span
                      className="grid size-7 shrink-0 place-items-center rounded-full bg-card text-base shadow-sm"
                      aria-hidden
                    >
                      {type.emoji}
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
                  <div className="divide-y divide-border px-4">
                    {visibleProducts.map((product) => (
                      <ProductRow key={product.id} product={product} />
                    ))}
                  </div>
                </section>
              );
            })}
            {rest.length > 0 && (
              <section className="pb-2">
                <h2
                  className="sticky z-10 border-b border-border bg-tint-green px-4 py-2.5 text-[15px] font-black text-primary-dark"
                  style={{ top: HEADER_OFFSET_PX }}
                >
                  {t('other')}
                </h2>
                <div className="divide-y divide-border px-4">
                  {rest.map((product) => (
                    <ProductRow key={product.id} product={product} />
                  ))}
                </div>
              </section>
            )}
          </div>
        </div>
      ) : (
        <div className="bg-card px-4 pb-2">
          <div className="divide-y divide-border">
            {rest.map((product) => (
              <ProductRow key={product.id} product={product} />
            ))}
          </div>
        </div>
      )}
    </>
  );
}
