'use client';

import { Apple, Check, ChevronRight, Cookie, ImageIcon, Leaf, Milk, Search, Trash2, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import { PageHeader } from '@/components/shop/page-header';
import { formatPaise, paise } from '@/lib/money';
import { cn } from '@/lib/utils';
import { type DraftColumn, type DraftProduct, type DraftVariant, usePlanDraft } from './plan-draft-context';

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

const CATEGORY_ICONS: Record<string, typeof Leaf> = {
  vegetables: Leaf,
  fruits: Apple,
  dairy: Milk,
  'bakery-biscuits': Cookie,
  __daily_essentials__: Leaf,
  __sprouts__: Leaf,
};

export function DayBuilderScreen({ dayOfWeek }: { dayOfWeek: number }) {
  const t = useTranslations('mealPlan');
  const tw = useTranslations('mealPlan.wizard');
  const tc = useTranslations('common');
  const router = useRouter();
  const draft = usePlanDraft();

  const [activeSlug, setActiveSlug] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [picker, setPicker] = useState<DraftProduct | null>(null);
  const [showSummary, setShowSummary] = useState(false);

  const columns = draft.allColumns;
  const activeColumn: DraftColumn | undefined = activeSlug
    ? columns.find((c) => c.slug === activeSlug)
    : columns[0];

  if (draft.loading) {
    return (
      <>
        <PageHeader title={t(`days.${dayOfWeek}`)} backHref="/meal-plan/build" backLabel={tc('back')} />
        <main className="px-4 py-8 text-sm text-muted-foreground">{tc('loading')}</main>
      </>
    );
  }

  const daySelections = draft.selections[dayOfWeek] ?? {};
  const dayCount = draft.itemCount(dayOfWeek);

  const filteredProducts = (activeColumn?.products ?? []).filter((product) =>
    product.name.toLowerCase().includes(search.trim().toLowerCase()),
  );

  function categoryLabel(column: DraftColumn) {
    if (column.slug === '__daily_essentials__') return t('builder.dailyEssentialsTitle');
    if (column.slug === '__sprouts__') return t('builder.sproutsTitle');
    return column.name;
  }

  function pick(product: DraftProduct, variantId: string | null) {
    draft.setItem(dayOfWeek, product.id, variantId);
    setPicker(null);
  }

  return (
    <>
      <PageHeader
        title={t(`days.${dayOfWeek}`)}
        subtitle={showSummary ? tw('reviewHint') : tw('addItemsHint')}
        backHref={showSummary ? undefined : '/meal-plan/build'}
        backLabel={tc('back')}
        trailing={
          <span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-bold text-muted-foreground">
            {tw('itemCount', { count: dayCount })}
          </span>
        }
      />

      {showSummary ? (
        <DaySummaryView
          dayOfWeek={dayOfWeek}
          onBack={() => setShowSummary(false)}
          onEdit={(product) => setPicker(product)}
        />
      ) : (
        <main className="pb-28">
          {/* ── Category tabs */}
          {/* Relative wrapper + a right-edge fade (client feedback, session
              2026-09-17): the row cuts a tab off mid-label at the scrollport
              edge with nothing hinting there's more to scroll to — the fade
              reads as "this keeps going" the way the same trick does on the
              home page's horizontal rails. `pointer-events-none` so it never
              blocks a tap on whatever tab sits underneath it. */}
          <div className="relative border-b border-border bg-card">
            <div className="flex gap-2 overflow-x-auto px-4 py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {columns.map((column) => {
                const Icon = CATEGORY_ICONS[column.slug] ?? Leaf;
                const active = (activeColumn?.slug ?? columns[0]?.slug) === column.slug;
                return (
                  <button
                    key={column.slug}
                    type="button"
                    onClick={() => {
                      setActiveSlug(column.slug);
                      setSearch('');
                    }}
                    className={cn(
                      'flex shrink-0 items-center gap-2 rounded-full border py-1.5 pr-3.5 pl-1.5 text-xs font-semibold whitespace-nowrap',
                      active ? 'border-primary bg-tint-green text-primary-dark' : 'border-border text-muted-foreground',
                    )}
                  >
                    {/* The category's own real photo when one exists (admin-set
                        icon, or its first product's), matching the same photo
                        treatment the home page's category grid already uses —
                        a generic line icon only when no real image exists at
                        all (the curated Daily Essentials/Sprouts columns).
                        Sized up (client feedback, session 2026-09-17) — the
                        previous size-5 photo read as an afterthought next to
                        the label. */}
                    {column.iconUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={column.iconUrl} alt="" className="size-9 shrink-0 rounded-full object-cover" />
                    ) : (
                      <Icon className="size-5 shrink-0" aria-hidden />
                    )}
                    {categoryLabel(column)}
                  </button>
                );
              })}
            </div>
            <div
              aria-hidden
              className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-card to-transparent"
            />
          </div>

          {/* ── Search */}
          <div className="px-4 py-3">
            <div className="flex items-center gap-2 rounded-[var(--radius)] border border-border bg-card px-3 py-2.5">
              <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={tw('searchPlaceholder', { category: activeColumn ? categoryLabel(activeColumn) : '' })}
                className="w-full bg-transparent text-sm outline-none"
              />
            </div>
          </div>

          {/* ── Product grid */}
          <div className="grid grid-cols-2 gap-3 px-4">
            {filteredProducts.map((product) => (
              <PlanProductCard
                key={product.id}
                product={product}
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

      {!showSummary && dayCount > 0 && (
        <div
          className="fixed inset-x-0 z-30 mx-auto max-w-[480px] px-16 py-4"
          style={{ bottom: 'calc(var(--bottom-nav-height) + env(safe-area-inset-bottom, 0px))' }}
        >
          <button
            type="button"
            onClick={() => setShowSummary(true)}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-primary text-sm font-bold text-primary-foreground"
          >
            {tw('viewDayPlan', { count: dayCount })}
            <ChevronRight className="size-4" aria-hidden />
          </button>
        </div>
      )}

      {showSummary && (
        <div
          className="fixed inset-x-0 z-30 mx-auto max-w-[480px] px-16 py-4"
          style={{ bottom: 'calc(var(--bottom-nav-height) + env(safe-area-inset-bottom, 0px))' }}
        >
          <button
            type="button"
            onClick={() => router.push('/meal-plan/build')}
            className="flex h-12 w-full items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground"
          >
            {tw('saveForDay', { day: t(`days.${dayOfWeek}`) })}
          </button>
        </div>
      )}
    </>
  );
}

function PlanProductCard({
  product,
  selectedVariantId,
  onTap,
}: {
  product: DraftProduct;
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

  return (
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
      className="card-3d relative flex flex-col overflow-hidden rounded-[var(--radius)] border border-border/50 bg-card text-left disabled:opacity-50"
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
          // read as barely-there against a busy image.
          <span className="absolute top-2 right-2 grid size-7 place-items-center rounded-full bg-primary shadow-md ring-2 ring-white">
            <Check className="size-4 text-primary-foreground" strokeWidth={3} aria-hidden />
          </span>
        )}
      </div>
      {/* No `min-h`/`mt-auto` gap-filler here (dropped, session 2026-09-17
          — client feedback): the storefront's own card reserves 2 lines'
          worth of name height so the price row lines up across a grid row,
          but that left a large dead gap above a short one-line name here.
          A plain small gap plus real bottom padding (`pb-2.5`, previously
          missing entirely) reads far tighter. */}
      <div className="flex flex-col gap-1 px-2.5 pt-2 pb-2.5">
        <h3 className="line-clamp-2 text-[13px] leading-tight font-semibold">
          {product.nameEn ?? product.name}
          {product.localName && (
            <span className="font-normal text-muted-foreground"> ({product.localName})</span>
          )}
        </h3>
        {displayVariant && (
          <div className="mt-auto flex items-end justify-between gap-1.5 pt-1">
            <div className="min-w-0">
              <div className="flex items-baseline gap-1">
                <span className="text-[14px] font-bold">{formatPaise(price, { hidePaise: true })}</span>
                {hasDiscount && (
                  <span className="text-[11px] text-muted-foreground line-through">
                    {formatPaise(mrp, { hidePaise: true })}
                  </span>
                )}
              </div>
              <p className="truncate text-[11px] text-muted-foreground">{displayVariant.label}</p>
            </div>
            {/* Decorative, not a nested `<button>` — the whole card is
                already the tap target (it opens the quantity/weight
                modal), so this just mirrors the storefront's bordered
                pill visually instead of duplicating its click handler. */}
            <span className="flex shrink-0 min-w-[44px] flex-col items-center justify-center gap-0 rounded-lg border-[1.5px] border-primary bg-card px-1.5 py-1 text-[12px] font-bold text-primary">
              {t('add')}
              {multiVariant && (
                <span className="text-[8px] leading-none font-semibold text-muted-foreground">
                  {t('nOptions', { count: product.variants.length })}
                </span>
              )}
            </span>
          </div>
        )}
      </div>
    </button>
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
    <main className="space-y-4 p-4 pb-28">
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
