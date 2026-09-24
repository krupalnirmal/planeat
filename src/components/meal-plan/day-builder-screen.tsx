'use client';

import {
  Apple,
  Carrot,
  Check,
  ChevronRight,
  Cookie,
  Heart,
  ImageIcon,
  Leaf,
  Milk,
  Plus,
  Salad,
  ShoppingBasket,
  Sprout,
  Trash2,
  Weight,
  X,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import { AppHeader } from '@/components/shop/app-header';
import { PageHeader } from '@/components/shop/page-header';
import { useWishlisted } from '@/hooks/use-wishlist';
import { formatPaise, paise } from '@/lib/money';
import { cn } from '@/lib/utils';
import { DAYS, type DraftColumn, type DraftProduct, type DraftVariant, usePlanDraft } from './plan-draft-context';

/**
 * Wizard screens 3–8 for one day: browse a category (search + photo grid),
 * pick a size in a modal, and review/edit what's picked so far — all one
 * route rather than separate ones, since they're really one screen with two
 * views (browsing vs. reviewing) toggled by the sticky bottom bar, matching
 * how tapping "View Plan (N items)" in the reference behaves.
 *
 * The reference's add-item modal has a kg/g toggle plus a quantity stepper —
 * this app's data model doesn't support an arbitrary quantity of a product;
 * a meal-plan pick is always exactly one pack of one specific listed size
 * (`MealPlanItem.quantity` stores that size's own weight for display, never
 * an order count — see `src/lib/meal-plan/queries.ts`). So the modal here is
 * a size PICKER (250 g / 500 g / 1 kg as separate listed variants), not a
 * stepper — matching what the backend can actually represent.
 */

// Distinct icons per category (session 2026-09-20, client reference mockup)
// — `vegetables` and `__sprouts__` previously both rendered as a plain
// `Leaf`, indistinguishable in the rail; the reference gives each column its
// own icon, so the chip row is actually scannable at a glance.
const CATEGORY_ICONS: Record<string, typeof Leaf> = {
  vegetables: Leaf,
  fruits: Apple,
  dairy: Milk,
  'bakery-biscuits': Cookie,
  __daily_essentials__: Carrot,
  __sprouts__: Sprout,
  __chopped_vegetables__: Salad,
};

// Per-category chip colour (session 2026-09-23, client reference
// screenshot) — a distinct pastel background + icon tint per category,
// sampled from the reference image rather than guessed, same "colour per
// category" idea the home page's own `CategoryCollageTile` already uses
// (though not the same palette — that one's keyed to real category slugs
// only, this row also has the builder's synthetic `__sprouts__`-style
// slugs, which need their own colours).
const CATEGORY_CHIP_STYLE: Record<string, { bg: string; icon: string }> = {
  __sprouts__: { bg: '#DFF6E6', icon: '#2fa355' },
  __daily_essentials__: { bg: '#FDEEDB', icon: '#f2811d' },
  vegetables: { bg: '#EFF9F0', icon: '#2fa355' },
  __chopped_vegetables__: { bg: '#E8F3F7', icon: '#1a4d33' },
  fruits: { bg: '#FDEEF1', icon: '#e0518a' },
  dairy: { bg: '#EAF2FE', icon: '#2a78d6' },
  'bakery-biscuits': { bg: '#FCEEF3', icon: '#c9578e' },
};
const DEFAULT_CHIP_STYLE = { bg: '#F1F5F1', icon: '#2fa355' };

// Roughly this screen's own sticky `PageHeader`'s height (title + subtitle
// line, `py-3` padding) — same approach as `category-product-list.tsx`'s own
// `HEADER_OFFSET_PX`.
const PAGE_HEADER_HEIGHT_PX = 78;
// The day-switcher row's own height (session 2026-09-19 — lets the customer
// jump between days without leaving the picker and losing their place),
// stacked directly under the page header.
const DAY_TABS_HEIGHT_PX = 52;
const HEADER_OFFSET_PX = PAGE_HEADER_HEIGHT_PX + DAY_TABS_HEIGHT_PX;

export function DayBuilderScreen({ dayOfWeek }: { dayOfWeek: number }) {
  const t = useTranslations('mealPlan');
  const tw = useTranslations('mealPlan.wizard');
  const tc = useTranslations('common');
  const router = useRouter();
  const draft = usePlanDraft();

  const [activeSlug, setActiveSlug] = useState<string | null>(null);
  const [picker, setPicker] = useState<DraftProduct | null>(null);
  const [showSummary, setShowSummary] = useState(false);

  const dayTabsRef = useRef<HTMLElement>(null);
  const activeDayRef = useRef<HTMLButtonElement>(null);

  // Tapping a day pushes a new route, which remounts this screen with the
  // tab strip back at scroll 0 — so picking one of the later days (Sunday
  // worst of all) left the tab you had just chosen off-screen to the
  // right, with no sign it had been selected (client report, session
  // 2026-09-20). Centre it on mount instead.
  //
  // `scrollLeft` on the strip itself, not `scrollIntoView`: the latter
  // walks up every scrollable ancestor, so it would also scroll the page
  // vertically to bring the sticky strip into view — moving the product
  // grid the customer is actually looking at.
  //
  // `draft.loading` is in the deps because the strip isn't mounted yet on
  // the loading render below; without it the effect would run once
  // against null refs and never again.
  useEffect(() => {
    const container = dayTabsRef.current;
    const active = activeDayRef.current;
    if (!container || !active) return;

    const containerBox = container.getBoundingClientRect();
    const activeBox = active.getBoundingClientRect();
    container.scrollLeft +=
      activeBox.left - containerBox.left - (containerBox.width - activeBox.width) / 2;
  }, [dayOfWeek, draft.loading]);

  const columns = draft.allColumns;
  const activeColumn: DraftColumn | undefined = activeSlug
    ? columns.find((c) => c.slug === activeSlug)
    : columns[0];

  if (draft.loading) {
    return (
      <>
        <AppHeader sticky={false} />
        <PageHeader title={t(`days.${dayOfWeek}`)} backHref="/meal-plan/build" backLabel={tc('back')} />
        <main className="px-4 py-8 text-sm text-muted-foreground">{tc('loading')}</main>
      </>
    );
  }

  const daySelections = draft.selections[dayOfWeek] ?? {};
  const dayCount = draft.itemCount(dayOfWeek);

  // Already-picked items float to the top (client feedback, session
  // 2026-09-17) — `.sort()` is stable, so within "selected" and
  // "unselected" each keeps the catalogue's own order rather than being
  // reshuffled every render.
  const filteredProducts = (activeColumn?.products ?? [])
    .slice()
    .sort((a, b) => Number(!daySelections[a.id]) - Number(!daySelections[b.id]));

  function categoryLabel(column: DraftColumn) {
    if (column.slug === '__daily_essentials__') return t('builder.dailyEssentialsTitle');
    if (column.slug === '__sprouts__') return t('builder.sproutsTitle');
    if (column.slug === '__chopped_vegetables__') return t('builder.choppedVegetablesTitle');
    return column.name;
  }

  function pick(product: DraftProduct, variantId: string | null) {
    draft.setItem(dayOfWeek, product.id, variantId);
    setPicker(null);
  }

  return (
    <>
      {/* Not sticky here (session 2026-09-24, client reference wants this
          header on every meal-plan screen, but this one already has its own
          sticky `PageHeader` + day-tabs + search row stacked right below —
          see `AppHeader`'s own doc comment on why two `top: 0` stickies
          can't coexist). Scrolls away with the page instead; the sticky
          `PageHeader` below still pins at the real top once this one has
          scrolled past. */}
      <AppHeader sticky={false} />
      <PageHeader
        title={t(`days.${dayOfWeek}`)}
        subtitle={showSummary ? tw('reviewHint') : tw('addItemsHint')}
        backHref={showSummary ? undefined : '/meal-plan/build'}
        backLabel={tc('back')}
        trailing={
          <span className="flex items-center gap-1.5 rounded-full bg-tint-green px-2.5 py-1 text-xs font-bold text-primary">
            {tw('itemCount', { count: dayCount })}
            <ShoppingBasket className="size-3.5 shrink-0" aria-hidden />
          </span>
        }
      />

      {/* ── Day switcher (session 2026-09-19, client request) — jump
          straight to another day from inside the picker instead of having
          to tap back to the day list first. `PlanDraftProvider` is mounted
          once at the wizard layout and survives this client-side
          navigation, so every day's picks stay exactly as left — each
          tab's own live count badge is the confirmation nothing was lost,
          rather than a one-off "saved" toast that would imply a server
          round trip nothing here actually makes (the whole week only ever
          saves once, from the summary screen's "Confirm & Save Plan"). */}
      <nav
        ref={dayTabsRef}
        aria-label={tw('daysLabel')}
        // `card-3d` (session 2026-09-25, user request) — a pure box-shadow,
        // so it visually lifts this row off the category row stacked
        // underneath without changing its actual height (which the sticky
        // `HEADER_OFFSET_PX` math below depends on staying exact). The
        // plain 1px `border-b` alone read as the two rows "stuck together"
        // once both were sticky against each other while scrolling.
        className="card-3d sticky z-20 flex gap-2 overflow-x-auto bg-card px-3 py-2.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={{ top: PAGE_HEADER_HEIGHT_PX }}
      >
        {DAYS.map((day) => {
          const active = day === dayOfWeek;
          return (
            <button
              key={day}
              ref={active ? activeDayRef : undefined}
              type="button"
              onClick={() => {
                if (day !== dayOfWeek) router.push(`/meal-plan/build/${day}`);
              }}
              aria-current={active}
              // Day name only (session 2026-09-25, user request — dropped
              // the item-count text, the leaf-in-circle badge, and the
              // corner count badge this tab used to carry).
              className={cn(
                'flex shrink-0 items-center rounded-2xl px-4 py-2.5 text-center text-xs font-bold transition-colors',
                active ? 'bg-primary text-primary-foreground' : 'bg-tint-green text-primary-dark',
              )}
            >
              {t(`daysShort.${day}`)}
            </button>
          );
        })}
      </nav>

      {showSummary ? (
        <DaySummaryView
          dayOfWeek={dayOfWeek}
          onBack={() => setShowSummary(false)}
          onEdit={(product) => setPicker(product)}
        />
      ) : (
        <main className="pb-28 lg:mx-auto lg:max-w-2xl">
          {/* ── Category row, sticky under the day tabs (session 2026-09-20,
              client reference mockup; search bar dropped session 2026-09-25,
              user request) — a horizontally-scrollable row of
              icon-top/label-below chips. Selecting a chip still swaps the
              whole grid below rather than jump-scrolling to an anchor —
              this screen shows one category at a time. */}
          <div
            // `card-3d` (session 2026-09-25, user request) — same fix as
            // the day-tabs row above it: a pure box-shadow instead of a
            // plain 1px `border-b`, so this row visually lifts off the
            // product grid scrolling underneath instead of reading as
            // stuck together, without changing its height.
            className="card-3d sticky z-10 bg-card px-4 py-3"
            style={{ top: HEADER_OFFSET_PX }}
          >
            <nav
              aria-label={tw('categoriesLabel')}
              className="flex gap-2 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              {columns.map((column) => {
                const style = CATEGORY_CHIP_STYLE[column.slug] ?? DEFAULT_CHIP_STYLE;
                const active = (activeColumn?.slug ?? columns[0]?.slug) === column.slug;
                return (
                  <button
                    key={column.slug}
                    type="button"
                    onClick={() => setActiveSlug(column.slug)}
                    aria-current={active}
                    // Name only, no icon (session 2026-09-25, user request)
                    // — pastel-tinted pill sized to its own text instead of
                    // the earlier fixed-width icon-over-label card.
                    className={cn(
                      'shrink-0 rounded-2xl border-2 px-3.5 py-2.5 text-center text-[11.5px] font-bold whitespace-nowrap text-foreground transition-colors',
                      active ? 'border-primary' : 'border-transparent',
                    )}
                    style={{ backgroundColor: style.bg }}
                  >
                    {categoryLabel(column)}
                  </button>
                );
              })}
            </nav>
          </div>

          <div className="grid grid-cols-2 gap-3 bg-tint-lime px-4 py-3">
            {filteredProducts.map((product) => (
              <PlanProductCard
                key={product.id}
                product={product}
                categoryIcon={activeColumn ? (CATEGORY_ICONS[activeColumn.slug] ?? Leaf) : Leaf}
                selectedVariantId={daySelections[product.id]}
                onTap={() => setPicker(product)}
              />
            ))}
          </div>
        </main>
      )}

      {picker && (
        <QuantityModal
          product={picker}
          activeVariantId={daySelections[picker.id]}
          onSelect={(variantId) => pick(picker, variantId)}
          onRemove={() => pick(picker, null)}
          onClose={() => setPicker(null)}
        />
      )}

      {/* `flex justify-center` + a content-width button, replacing a
          `w-full` button inside a `px-32` wrapper (session 2026-09-20,
          client request). That fixed 128px-a-side inset pinned the pill
          to ~154px while "View Plan (11 items)" alone needs ~164px, so
          the label was wedged flush into the rounded ends with nowhere
          to put padding. Sizing the pill to its own content instead
          means the padding is always real breathing room, and it holds
          for the longer Marathi/Hindi strings too rather than only for
          the English the magic number was tuned against. */}
      {!showSummary && dayCount > 0 && (
        <div
          className="fixed inset-x-0 z-30 mx-auto flex max-w-[480px] justify-center px-4 py-4"
          style={{ bottom: 'calc(var(--bottom-nav-height) + env(safe-area-inset-bottom, 0px))' }}
        >
          {/* Yellow, matching the accent the bottom nav's active tab and
              the storefront's own View Cart bar now use. */}
          <button
            type="button"
            onClick={() => setShowSummary(true)}
            className="flex h-12 max-w-full items-center justify-center gap-2 rounded-full bg-accent px-6 text-sm font-bold text-accent-foreground"
          >
            <span className="truncate">{tw('viewDayPlan', { count: dayCount })}</span>
            <ChevronRight className="size-4 shrink-0" aria-hidden />
          </button>
        </div>
      )}

      {showSummary && (
        <div
          className="fixed inset-x-0 z-30 mx-auto flex max-w-[480px] justify-center px-4 py-4"
          style={{ bottom: 'calc(var(--bottom-nav-height) + env(safe-area-inset-bottom, 0px))' }}
        >
          <button
            type="button"
            onClick={() => router.push('/meal-plan/build')}
            className="flex h-12 max-w-full items-center justify-center rounded-full bg-accent px-6 text-sm font-bold text-accent-foreground"
          >
            <span className="truncate">{tw('saveForDay', { day: t(`days.${dayOfWeek}`) })}</span>
          </button>
        </div>
      )}
    </>
  );
}

function PlanProductCard({
  product,
  categoryIcon: CategoryIcon,
  selectedVariantId,
  onTap,
}: {
  product: DraftProduct;
  categoryIcon: typeof Leaf;
  selectedVariantId: string | undefined;
  onTap: () => void;
}) {
  const t = useTranslations('product');
  const selected = product.variants.find((v) => v.id === selectedVariantId);
  const displayVariant = selected ?? product.variants[0];
  const price = displayVariant ? paise(displayVariant.pricePaise) : 0n;
  const mrp = displayVariant ? paise(displayVariant.mrpPaise) : 0n;
  const hasDiscount = mrp > price;
  const multiVariant = product.variants.length > 1;
  const [wishlisted, toggleWishlisted] = useWishlisted(product.id);

  return (
    // `<article>`, not the old single `<button>` (session 2026-09-24,
    // client reference — the mockup's product photo carries its own heart
    // toggle, same as the storefront's `ProductCard`). A `<button>` can't
    // contain another interactive `<button>`, so the tappable area moved to
    // an inner button and the heart sits beside it as a sibling, exactly
    // `product-card.tsx`'s own "kept outside" structure.
    <article className="card-3d relative flex flex-col overflow-hidden rounded-[var(--radius)] border border-border/50 bg-card">
      <button
        type="button"
        onClick={onTap}
        disabled={product.variants.length === 0}
        // Matches the storefront's own `ProductCard` (`src/components/shop/
        // product-card.tsx`) — same `.card-3d` shadow, same rounded corners
        // and faint border, same square photo, discount badge, MRP strike-
        // through and bordered pill CTA — so the builder's cards look
        // consistent with the rest of the app instead of a one-off style
        // (client feedback, session 2026-09-17).
        className="flex flex-1 flex-col text-left disabled:opacity-50"
      >
        <div className="relative grid aspect-square place-items-center bg-white">
          {product.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={product.imageUrl} alt={product.name} loading="lazy" className="size-full object-cover" />
          ) : (
            <ImageIcon className="size-8 text-muted-foreground/40" aria-hidden />
          )}
          {hasDiscount && (
            <span className="absolute top-1.5 left-1.5 rounded bg-primary px-1.5 py-0.5 text-[10px] font-bold text-primary-foreground">
              {Math.round((1 - Number(price) / Number(mrp)) * 100)}% {t('off')}
            </span>
          )}
          {selected && (
            // Bolder than the earlier faint white-on-card badge (client
            // feedback, session 2026-09-17): a solid filled circle with a
            // white ring to pop off the photo, not a translucent chip that
            // read as barely-there against a busy image. Bottom-right, not
            // top-right (session 2026-09-24) — the heart toggle now owns
            // that corner, matching the client reference screenshot.
            <span className="absolute right-1.5 bottom-1.5 grid size-7 place-items-center rounded-full bg-primary shadow-md ring-2 ring-white">
              <Check className="size-4 text-primary-foreground" strokeWidth={3} aria-hidden />
            </span>
          )}
        </div>
        {/* No `min-h`/`mt-auto` gap-filler here (dropped, session 2026-09-17
          — client feedback): the storefront's own card reserves 2 lines'
          worth of name height so the price row lines up across a grid row,
          but that left a large dead gap above a short one-line name here.
          A plain small gap plus real bottom padding (`pb-2.5`, previously
          missing entirely) reads far tighter.

          Name, local name, and weight each on their own line (session
          2026-09-20, client reference mockup) — previously the local name
          rode inline with the product name and the weight sat squeezed
          under the price on the right; the reference stacks all three
          above the price row instead. */}
      <div className="flex flex-col gap-0.5 px-2.5 pt-2 pb-2.5">
        {/* Small category-icon prefix on the name, filled "+ ADD" pill
            (session 2026-09-23, client reference screenshot) — was a plain
            name line and an outlined text-only "ADD" label; the reference
            leads the name with the category's own icon and gives the CTA
            real button weight (filled green, a leading plus). */}
        <h3 className="flex items-center gap-1 text-[13px] leading-tight font-semibold">
          <CategoryIcon className="size-3.5 shrink-0 text-primary" aria-hidden />
          <span className="line-clamp-1">{product.nameEn ?? product.name}</span>
        </h3>
        {product.localName && (
          <p className="line-clamp-1 text-[11.5px] text-muted-foreground">({product.localName})</p>
        )}
        {displayVariant && (
          <>
            <p className="flex items-center gap-1 truncate text-[11px] text-muted-foreground">
              <Weight className="size-3 shrink-0" aria-hidden />
              {displayVariant.label}
            </p>
            <div className="mt-1 flex items-end justify-between gap-1.5">
              <div className="min-w-0">
                <div className="flex items-baseline gap-1">
                  <span className="text-[14px] font-bold text-primary">
                    {formatPaise(price, { hidePaise: true })}
                  </span>
                  {hasDiscount && (
                    <span className="text-[11px] text-muted-foreground line-through">
                      {formatPaise(mrp, { hidePaise: true })}
                    </span>
                  )}
                </div>
                {multiVariant && (
                  <span className="text-[9px] leading-none font-semibold text-muted-foreground">
                    {t('nOptions', { count: product.variants.length })}
                  </span>
                )}
              </div>
              {/* Decorative, not a nested `<button>` — the whole card is
                  already the tap target (it opens the quantity/weight
                  modal), so this just mirrors the storefront's filled
                  pill visually instead of duplicating its click handler. */}
              <span className="flex shrink-0 items-center gap-0.5 rounded-full bg-primary px-2.5 py-1.5 text-[11px] font-bold text-primary-foreground">
                <Plus className="size-3 shrink-0" aria-hidden />
                {t('add')}
              </span>
            </div>
          </>
        )}
      </div>
      </button>

      {/* Sibling of the tap button, not nested inside it — same reasoning
          `product-card.tsx` already documents on its own heart button. */}
      <button
        type="button"
        onClick={toggleWishlisted}
        aria-pressed={wishlisted}
        aria-label={t(wishlisted ? 'wishlistRemove' : 'wishlistAdd', { name: product.name })}
        className="absolute top-1.5 right-1.5 grid size-7 place-items-center rounded-full bg-card/95 shadow-sm"
      >
        <Heart
          className={cn('size-3.5', wishlisted ? 'fill-primary text-primary' : 'text-muted-foreground')}
          aria-hidden
        />
      </button>
    </article>
  );
}

function QuantityModal({
  product,
  activeVariantId,
  onSelect,
  onRemove,
  onClose,
}: {
  product: DraftProduct;
  activeVariantId: string | undefined;
  onSelect: (variantId: string) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const tw = useTranslations('mealPlan.wizard');
  const tc = useTranslations('common');
  const [selected, setSelected] = useState(activeVariantId ?? product.variants[0]?.id);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center">
      <div className="w-full max-w-[420px] rounded-t-[calc(var(--radius)*1.6)] bg-background p-4 sm:rounded-[calc(var(--radius)*1.6)]">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-[var(--radius)] bg-white">
              {product.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={product.imageUrl} alt={product.name} className="size-full object-cover" />
              ) : (
                <ImageIcon className="size-6 text-muted-foreground/40" aria-hidden />
              )}
            </div>
            <h2 className="text-sm font-bold">
              {product.nameEn ?? product.name}
              {product.localName && (
                <span className="font-normal text-muted-foreground"> ({product.localName})</span>
              )}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={tc('close')}
            className="grid size-9 shrink-0 place-items-center rounded-full"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>

        <p className="mb-2 text-xs font-semibold text-muted-foreground">{tw('selectSize')}</p>
        <div className="space-y-1.5">
          {product.variants.map((variant) => {
            const active = variant.id === selected;
            return (
              <button
                key={variant.id}
                type="button"
                onClick={() => setSelected(variant.id)}
                className={cn(
                  'flex w-full items-center justify-between gap-3 rounded-[var(--radius)] border px-3.5 py-2.5 text-left',
                  active ? 'border-primary bg-tint-green' : 'border-border',
                )}
              >
                <span className="text-sm font-semibold">{variant.label}</span>
                <span className="flex items-center gap-2">
                  <span className="text-sm font-bold">{formatPaise(paise(variant.pricePaise))}</span>
                  {active && <Check className="size-4 text-primary" aria-hidden />}
                </span>
              </button>
            );
          })}
        </div>

        <button
          type="button"
          disabled={!selected}
          onClick={() => selected && onSelect(selected)}
          className="mt-4 flex h-12 w-full items-center justify-center rounded-[var(--radius)] bg-primary text-sm font-bold text-primary-foreground disabled:opacity-50"
        >
          {tw('addToPlan')}
        </button>

        {activeVariantId && (
          <button
            type="button"
            onClick={onRemove}
            className="mt-2.5 flex h-10 w-full items-center justify-center rounded-[var(--radius)] border border-danger/40 text-sm font-bold text-danger"
          >
            {tw('removeItem')}
          </button>
        )}
      </div>
    </div>
  );
}

function DaySummaryView({
  dayOfWeek,
  onBack,
  onEdit,
}: {
  dayOfWeek: number;
  onBack: () => void;
  onEdit: (product: DraftProduct) => void;
}) {
  const tw = useTranslations('mealPlan.wizard');
  const draft = usePlanDraft();

  const selections = draft.selections[dayOfWeek] ?? {};
  const items = useMemo(
    () =>
      Object.entries(selections)
        .map(([productId, variantId]) => {
          const product = draft.productOf(productId);
          const variant = draft.variantOf(productId, variantId);
          return product && variant ? { product, variant } : null;
        })
        .filter((entry): entry is { product: DraftProduct; variant: DraftVariant } => entry !== null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selections],
  );

  return (
    <main className="space-y-4 p-4 pb-28 lg:mx-auto lg:max-w-2xl">
      <button type="button" onClick={onBack} className="text-xs font-semibold text-primary">
        {tw('backToItems')}
      </button>

      {items.length === 0 ? (
        <p className="rounded-[var(--radius)] border border-dashed border-border bg-card px-4 py-10 text-center text-sm text-muted-foreground">
          {tw('daySummaryEmpty')}
        </p>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-[var(--radius-2xl)] border border-border bg-card">
          {items.map(({ product, variant }) => (
            <li key={product.id} className="flex items-center gap-3 px-4 py-3">
              <div className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-[var(--radius)] bg-white">
                {product.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={product.imageUrl} alt={product.name} className="size-full object-cover" />
                ) : (
                  <ImageIcon className="size-5 text-muted-foreground/40" aria-hidden />
                )}
              </div>
              <button type="button" onClick={() => onEdit(product)} className="min-w-0 flex-1 text-left">
                <p className="truncate text-sm font-semibold">
                  {product.nameEn ?? product.name}
                  {product.localName && (
                    <span className="font-normal text-muted-foreground"> ({product.localName})</span>
                  )}
                </p>
                <p className="text-xs text-muted-foreground">{variant.label}</p>
              </button>
              <span className="text-sm font-bold">{formatPaise(paise(variant.pricePaise))}</span>
              <button
                type="button"
                onClick={() => draft.setItem(dayOfWeek, product.id, null)}
                aria-label={tw('removeItem')}
                className="grid size-9 shrink-0 place-items-center rounded-full text-danger"
              >
                <Trash2 className="size-4" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center justify-between rounded-[var(--radius)] bg-secondary px-4 py-3 text-sm font-bold">
        <span>{tw('estimatedTotal')}</span>
        <span>{formatPaise(draft.dayTotalPaise(dayOfWeek))}</span>
      </div>
    </main>
  );
}
