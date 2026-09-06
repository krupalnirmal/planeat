'use client';

import { Check, ClipboardList, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * The manual weekly plan builder (session 2026-08-30) — a day × category
 * table where every cell is a chip per real, in-stock, meal-plan-eligible
 * product. Tapping a chip opens a small sheet of that product's real
 * weights/prices; picking one marks the chip active. Modeled on the
 * client's reference HTML (a plain table, `overflow-x-auto` on mobile,
 * click-a-chip-to-open-a-weight-menu) but built on the shop's own product
 * data instead of a hardcoded demo list, and on the existing
 * `variant-picker-sheet.tsx` bottom-sheet layout instead of an absolutely
 * positioned dropdown, since a small anchored popup is easy to clip on a
 * narrow phone screen where this table already scrolls sideways.
 */

export interface PlanVariant {
  id: string;
  label: string;
  pricePaise: string;
}

export interface PlanProduct {
  id: string;
  name: string;
  variants: PlanVariant[];
}

export interface PlanColumn {
  slug: string;
  name: string;
  products: PlanProduct[];
}

export interface PlanItem {
  productId: string;
  variantId: string;
}

export interface InitialPlanDay {
  dayOfWeek: number;
  items: PlanItem[];
}

/** The shape `PUT /api/meal-plan/current` actually validates against
    (`variantIds: string[]`) — deliberately not `InitialPlanDay`, which is
    what the GET response looks like. Session 2026-09-06: `handleSave` used
    to send `InitialPlanDay`-shaped days (an `items` array of
    `{productId, variantId}` objects), which the server's Zod schema
    rejected outright — the save silently failed with no `onError` handler
    to surface it, so nothing was ever actually persisted. */
export interface SavePlanDay {
  dayOfWeek: number;
  variantIds: string[];
}

/** `{ [dayOfWeek]: { [productId]: variantId } }` — the whole table's edit state. */
type Selections = Record<number, Record<string, string>>;

const DAYS = [1, 2, 3, 4, 5, 6, 7] as const;

function buildInitialSelections(days: InitialPlanDay[] | undefined): Selections {
  const selections: Selections = {};
  for (const dayOfWeek of DAYS) selections[dayOfWeek] = {};
  for (const day of days ?? []) {
    for (const item of day.items) {
      selections[day.dayOfWeek][item.productId] = item.variantId;
    }
  }
  return selections;
}

function variantLabelOf(product: PlanProduct, variantId: string | undefined): PlanVariant | null {
  if (!variantId) return null;
  return product.variants.find((v) => v.id === variantId) ?? null;
}

export function PlanTable({
  columns,
  initialDays,
  dailyEssentials,
  sprouts,
  onSave,
  saving,
  saved,
}: {
  columns: PlanColumn[];
  initialDays: InitialPlanDay[] | undefined;
  /** "Daily Use Vegetables" and "Sprouts" — curated subsets of the
      Vegetables category, each pulled into its own column so the same
      product is never pickable in two places at once. Picked per day
      exactly like every other column (client feedback, session
      2026-09-06 — an earlier version made "Daily Use Vegetables" apply
      one pick to all 7 days at once, which wasn't what was wanted). Empty
      until real products exist for a list, in which case that column just
      doesn't render. */
  dailyEssentials: PlanProduct[];
  sprouts: PlanProduct[];
  onSave: (days: SavePlanDay[]) => void;
  saving: boolean;
  saved: boolean;
}) {
  const t = useTranslations('mealPlan');
  // The curated columns are just more columns for edit-state purposes —
  // folding them into the same list here means every render below (header,
  // body cells, summary) needs exactly one code path, not three near-duplicates.
  const curated: Array<{ slug: string; name: string; products: PlanProduct[] }> = [
    { slug: '__daily_essentials__', name: t('builder.dailyEssentialsTitle'), products: dailyEssentials },
    { slug: '__sprouts__', name: t('builder.sproutsTitle'), products: sprouts },
  ];
  const allColumns: PlanColumn[] = [...columns, ...curated.filter((c) => c.products.length > 0)];
  const [selections, setSelections] = useState<Selections>(() => buildInitialSelections(initialDays));
  const [picker, setPicker] = useState<{ dayOfWeek: number; product: PlanProduct } | null>(null);

  function pickVariant(variantId: string) {
    if (!picker) return;
    const { dayOfWeek, product } = picker;
    setSelections((prev) => ({
      ...prev,
      [dayOfWeek]: { ...prev[dayOfWeek], [product.id]: variantId },
    }));
    setPicker(null);
  }

  function removeVariant() {
    if (!picker) return;
    const { dayOfWeek, product } = picker;
    setSelections((prev) => {
      const day = { ...prev[dayOfWeek] };
      delete day[product.id];
      return { ...prev, [dayOfWeek]: day };
    });
    setPicker(null);
  }

  function handleSave() {
    onSave(
      DAYS.map((dayOfWeek) => ({
        dayOfWeek,
        variantIds: Object.values(selections[dayOfWeek] ?? {}),
      })),
    );
  }

  const hasAnySelection = DAYS.some((d) => Object.keys(selections[d] ?? {}).length > 0);

  return (
    <div>
      {/* `max-h` + `overflow-auto` (both axes) rather than plain `overflow-x-auto`:
          per the CSS overflow spec, giving only one axis a non-`visible` value
          silently forces the other axis to `auto` too, so this div was already
          a scroll container on both axes — just one that never actually
          scrolled vertically (unbounded height), which is why `sticky top-0`
          below never had a real scrollport to stick within. Bounding the
          height makes it a genuine scroll container so the sticky header and
          sticky day column both work. */}
      <div className="-mx-4 max-h-[70vh] overflow-auto px-4">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          {/* Header row sticks vertically (client feedback: scrolling down loses
              track of which category — Vegetables/Fruits/etc — a cell is under),
              the day column sticks horizontally; the corner cell needs both, so
              it gets the highest z-index of the three sticky layers. */}
          <thead>
            <tr>
              <th className="sticky top-0 left-0 z-30 w-20 border border-border bg-card p-2 text-xs font-bold">
                {t('builder.dayColumn')}
              </th>
              {allColumns.map((col) => (
                <th
                  key={col.slug}
                  className="sticky top-0 z-20 border border-border bg-secondary p-2 text-center text-xs font-bold"
                >
                  {col.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {DAYS.map((dayOfWeek) => (
              <tr key={dayOfWeek}>
                <td className="sticky left-0 z-10 border border-border bg-card p-2 text-center text-xs font-bold">
                  {t(`days.${dayOfWeek}`)}
                </td>
                {allColumns.map((col) => (
                  <td key={col.slug} className="border border-border bg-background p-1.5 align-top">
                    <div className="flex flex-wrap gap-1.5">
                      {col.products.map((product) => {
                        const variantId = selections[dayOfWeek]?.[product.id];
                        const activeVariant = variantLabelOf(product, variantId);
                        return (
                          <button
                            key={product.id}
                            type="button"
                            onClick={() => setPicker({ dayOfWeek, product })}
                            // Overrides this app's global 44px button
                            // touch-target rule (R10, src/app/globals.css) —
                            // that rule targets primary actions, but a day ×
                            // category cell can hold 20+ of these, and
                            // wrapping every one of them to 44px tall would
                            // make a single cell taller than the screen.
                            // 28px still clears WCAG's own 24px floor;
                            // `gap-1.5` (up from `gap-1`) adds a bit of
                            // spacing back to offset the smaller target.
                            className={cn(
                              'min-h-0 h-7 rounded-full border px-2.5 py-1 text-[11px] whitespace-nowrap',
                              activeVariant
                                ? 'border-primary bg-primary text-primary-foreground font-semibold'
                                : 'border-border bg-card text-foreground',
                            )}
                          >
                            {product.name}
                            {activeVariant ? ` (${activeVariant.label})` : ''}
                          </button>
                        );
                      })}
                    </div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Live summary — pure derived render off the same `selections` state,
          no second query. Only days with at least one pick show up.
          Redesigned (session 2026-09-06, client feedback: the plain
          bordered text list "didn't look proper") to match the rounded-
          card/shadow language the rest of the app already uses — a day
          badge per row instead of a bare "Monday:" label. */}
      <section className="card-3d mt-5 rounded-[var(--radius-2xl)] bg-card p-4">
        <h2 className="flex items-center gap-2 text-sm font-bold text-primary-dark">
          <ClipboardList className="size-4 text-primary" aria-hidden />
          {t('builder.summaryTitle')}
        </h2>
        {!hasAnySelection ? (
          <p className="mt-3 text-xs text-muted-foreground">{t('builder.summaryEmpty')}</p>
        ) : (
          <ul className="mt-3 divide-y divide-border/60">
            {DAYS.filter((d) => Object.keys(selections[d] ?? {}).length > 0).map((dayOfWeek) => {
              const names = allColumns
                .flatMap((col) => col.products)
                .filter((p) => selections[dayOfWeek][p.id])
                .map((p) => {
                  const v = variantLabelOf(p, selections[dayOfWeek][p.id]);
                  return v ? `${p.name} (${v.label})` : p.name;
                });
              return (
                <li key={dayOfWeek} className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
                  <span className="mt-0.5 shrink-0 rounded-full bg-tint-green px-2.5 py-1 text-[11px] font-bold text-primary-dark">
                    {t(`daysShort.${dayOfWeek}`)}
                  </span>
                  <p className="text-xs leading-relaxed">{names.join(', ')}</p>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        className="mt-4 flex h-12 w-full items-center justify-center rounded-[var(--radius)] bg-primary text-sm font-bold text-primary-foreground disabled:opacity-50"
      >
        {saving ? t('builder.saving') : t('builder.saveButton')}
      </button>
      {saved && <p className="mt-2 text-center text-xs font-semibold text-primary">{t('builder.saved')}</p>}

      {picker && (
        <VariantPicker
          product={picker.product}
          activeVariantId={selections[picker.dayOfWeek]?.[picker.product.id]}
          onSelect={pickVariant}
          onRemove={removeVariant}
          onClose={() => setPicker(null)}
        />
      )}
    </div>
  );
}

/**
 * Same rounded-top bottom-sheet layout as `src/components/shop/variant-picker-sheet.tsx`
 * (the size picker the shop's own product cards open), but callback-driven
 * instead of wired to `useCart` — this one edits the plan table's local
 * state, not the cart.
 */
function VariantPicker({
  product,
  activeVariantId,
  onSelect,
  onRemove,
  onClose,
}: {
  product: PlanProduct;
  activeVariantId: string | undefined;
  onSelect: (variantId: string) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const t = useTranslations('mealPlan');
  const tc = useTranslations('common');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-[300px] rounded-[calc(var(--radius)*1.6)] bg-background p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="min-w-0 flex-1 truncate text-sm font-bold">{product.name}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={tc('close')}
            className="grid size-9 shrink-0 place-items-center rounded-full"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>

        <div className="space-y-1.5">
          {product.variants.map((variant) => {
            const active = variant.id === activeVariantId;
            return (
              <button
                key={variant.id}
                type="button"
                onClick={() => onSelect(variant.id)}
                className={cn(
                  'flex w-full items-center justify-between gap-3 rounded-[var(--radius)] border px-3.5 py-2.5 text-left',
                  active ? 'border-primary bg-tint-green' : 'border-border',
                )}
              >
                <span className="text-sm font-semibold">{variant.label}</span>
                {active && <Check className="size-4 text-primary" aria-hidden />}
              </button>
            );
          })}
        </div>

        {activeVariantId && (
          <button
            type="button"
            onClick={onRemove}
            className="mt-2.5 flex h-10 w-full items-center justify-center rounded-[var(--radius)] border border-danger/40 text-sm font-bold text-danger"
          >
            {t('builder.remove')}
          </button>
        )}
      </div>
    </div>
  );
}
