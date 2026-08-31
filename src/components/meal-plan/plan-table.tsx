'use client';

import { X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { formatPaise, paise } from '@/lib/money';
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
  planKey,
  onSave,
  saving,
  saved,
}: {
  columns: PlanColumn[];
  initialDays: InitialPlanDay[] | undefined;
  /** Remount key from the parent — bumps once after the first save so a
      freshly-created plan's id doesn't force a re-hydration of in-progress edits. */
  planKey: string;
  onSave: (days: InitialPlanDay[]) => void;
  saving: boolean;
  saved: boolean;
}) {
  const t = useTranslations('mealPlan');
  const [selections, setSelections] = useState<Selections>(() => buildInitialSelections(initialDays));
  const [picker, setPicker] = useState<{ dayOfWeek: number; product: PlanProduct } | null>(null);

  function pickVariant(dayOfWeek: number, productId: string, variantId: string) {
    setSelections((prev) => ({
      ...prev,
      [dayOfWeek]: { ...prev[dayOfWeek], [productId]: variantId },
    }));
    setPicker(null);
  }

  function removeVariant(dayOfWeek: number, productId: string) {
    setSelections((prev) => {
      const day = { ...prev[dayOfWeek] };
      delete day[productId];
      return { ...prev, [dayOfWeek]: day };
    });
    setPicker(null);
  }

  function handleSave() {
    onSave(
      DAYS.map((dayOfWeek) => ({
        dayOfWeek,
        items: Object.entries(selections[dayOfWeek] ?? {}).map(([productId, variantId]) => ({
          productId,
          variantId,
        })),
      })),
    );
  }

  const hasAnySelection = DAYS.some((d) => Object.keys(selections[d] ?? {}).length > 0);

  return (
    <div key={planKey}>
      <div className="-mx-4 overflow-x-auto px-4">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 w-20 border border-border bg-card p-2 text-xs font-bold">
                {t('builder.dayColumn')}
              </th>
              {columns.map((col) => (
                <th
                  key={col.slug}
                  className="border border-border bg-secondary p-2 text-center text-xs font-bold"
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
                {columns.map((col) => (
                  <td key={col.slug} className="border border-border bg-background p-1.5 align-top">
                    <div className="flex flex-wrap gap-1">
                      {col.products.map((product) => {
                        const variantId = selections[dayOfWeek]?.[product.id];
                        const activeVariant = variantLabelOf(product, variantId);
                        return (
                          <button
                            key={product.id}
                            type="button"
                            onClick={() => setPicker({ dayOfWeek, product })}
                            className={cn(
                              'rounded-full border px-2.5 py-1 text-[11px] whitespace-nowrap',
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
          no second query. Only days with at least one pick show up. */}
      <section className="mt-5 rounded-[var(--radius)] border border-border/60 bg-background p-4">
        <h2 className="text-sm font-bold">{t('builder.summaryTitle')}</h2>
        {!hasAnySelection ? (
          <p className="mt-2 text-xs text-muted-foreground">{t('builder.summaryEmpty')}</p>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {DAYS.filter((d) => Object.keys(selections[d] ?? {}).length > 0).map((dayOfWeek) => {
              const names = columns
                .flatMap((col) => col.products)
                .filter((p) => selections[dayOfWeek][p.id])
                .map((p) => {
                  const v = variantLabelOf(p, selections[dayOfWeek][p.id]);
                  return v ? `${p.name} (${v.label})` : p.name;
                });
              return (
                <li key={dayOfWeek} className="text-xs">
                  <span className="font-bold">{t(`days.${dayOfWeek}`)}:</span> {names.join(', ')}
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
          onSelect={(variantId) => pickVariant(picker.dayOfWeek, picker.product.id, variantId)}
          onRemove={() => removeVariant(picker.dayOfWeek, picker.product.id)}
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
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40">
      <div className="w-full max-w-[480px] rounded-t-[calc(var(--radius)*1.6)] bg-background p-5 pb-8">
        <div className="mb-4 flex items-center justify-between gap-2">
          <h2 className="min-w-0 flex-1 truncate text-base font-bold">{product.name}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={tc('close')}
            className="grid size-11 shrink-0 place-items-center rounded-full"
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>

        <div className="space-y-2">
          {product.variants.map((variant) => {
            const active = variant.id === activeVariantId;
            return (
              <button
                key={variant.id}
                type="button"
                onClick={() => onSelect(variant.id)}
                className={cn(
                  'flex w-full items-center justify-between gap-3 rounded-[var(--radius)] border px-3.5 py-3 text-left',
                  active ? 'border-primary bg-tint-green' : 'border-border',
                )}
              >
                <span className="text-sm font-semibold">{variant.label}</span>
                <span className="text-sm font-bold">
                  {formatPaise(paise(variant.pricePaise), { hidePaise: true })}
                </span>
              </button>
            );
          })}
        </div>

        {activeVariantId && (
          <button
            type="button"
            onClick={onRemove}
            className="mt-3 flex h-11 w-full items-center justify-center rounded-[var(--radius)] border border-danger/40 text-sm font-bold text-danger"
          >
            {t('builder.remove')}
          </button>
        )}
      </div>
    </div>
  );
}
