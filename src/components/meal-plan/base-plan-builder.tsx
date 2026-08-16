'use client';

import { useQuery } from '@tanstack/react-query';
import { Check, Plus, Sprout, X } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { api, qs } from '@/lib/api/client';
import type { AppLocale } from '@/i18n/routing';
import { cn } from '@/lib/utils';
import {
  BASE_PLAN_TEMPLATE,
  PLAN_CATEGORIES,
  type PlanCategory,
  type PlanOption,
} from '@/lib/meal-plan/base-plan-template';

export interface FinalSelection {
  day: string;
  items: Partial<Record<PlanCategory, PlanOption>>;
}

interface SearchResult {
  id: string;
  name: string;
}

const CATEGORY_LABEL_KEY: Record<PlanCategory, string> = {
  sprouts: 'categorySprouts',
  fruits: 'categoryFruits',
  dairy: 'categoryDairy',
  extras: 'categoryExtras',
  mainMeal: 'categoryMainMeal',
};

const SEARCH_DEBOUNCE_MS = 300;

function cellKey(day: string, category: PlanCategory) {
  return `${day}:${category}`;
}

/**
 * The client's day-by-day picker: tap an option for each day/category, the
 * chosen one highlights, and once every cell across the week is picked
 * "Confirm My Plan" compiles the read-only final plan (`BasePlanFinal`).
 *
 * Each cell ships with one default option (D-205's content gap). Rather than
 * inventing alternatives, "Add your own" searches the real catalogue
 * (`/api/products/search`, the same endpoint the main Search tab uses) —
 * free text would let someone substitute in a vegetable this store doesn't
 * actually sell, which a fresh-produce delivery plan can't honour. The
 * chosen product is scoped to this session's selection only, never written
 * back to the shared template.
 */
export function BasePlanBuilder({ onConfirm }: { onConfirm: (selection: FinalSelection[]) => void }) {
  const t = useTranslations('mealPlan.basePlan');
  const tDays = useTranslations('mealPlan.days');
  const locale = useLocale() as AppLocale;

  const [selected, setSelected] = useState<Record<string, PlanOption>>({});
  const [customOptions, setCustomOptions] = useState<Record<string, PlanOption>>({});
  const [addingKey, setAddingKey] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');

  const totalCells = BASE_PLAN_TEMPLATE.length * PLAN_CATEGORIES.length;
  const selectedCount = Object.keys(selected).length;
  const allSelected = selectedCount === totalCells;

  // Debounced catalogue search while the "add your own" box for a cell is
  // open — same debounce-then-useQuery split the main Search tab uses.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  const search = useQuery({
    queryKey: ['meal-plan-product-search', debouncedQuery, locale],
    queryFn: () => api.get<{ products: SearchResult[] }>(`/api/products/search${qs({ q: debouncedQuery, locale })}`),
    enabled: Boolean(addingKey) && debouncedQuery.length >= 2,
    staleTime: 30_000,
  });
  const results = search.data?.products ?? [];
  const searching = search.isFetching;

  function toggle(key: string, option: PlanOption) {
    setSelected((prev) => {
      const next = { ...prev };
      if (next[key]?.id === option.id) {
        delete next[key];
      } else {
        next[key] = option;
      }
      return next;
    });
  }

  function selectAll() {
    const next: Record<string, PlanOption> = {};
    for (const day of BASE_PLAN_TEMPLATE) {
      for (const category of PLAN_CATEGORIES) {
        next[cellKey(day.day, category)] = day[category][0];
      }
    }
    setSelected(next);
  }

  function openAdd(key: string) {
    setAddingKey(key);
    setQuery('');
    setDebouncedQuery('');
  }

  function closeAdd() {
    setAddingKey(null);
    setQuery('');
    setDebouncedQuery('');
  }

  function pickResult(key: string, product: SearchResult) {
    const custom: PlanOption = {
      id: `product-${product.id}`,
      label: { mr: product.name, hi: product.name, en: product.name },
    };
    setCustomOptions((prev) => ({ ...prev, [key]: custom }));
    setSelected((prev) => ({ ...prev, [key]: custom }));
    closeAdd();
  }

  function confirm() {
    const result: FinalSelection[] = BASE_PLAN_TEMPLATE.map((day) => ({
      day: day.day,
      items: Object.fromEntries(
        PLAN_CATEGORIES.map((category) => [category, selected[cellKey(day.day, category)]]).filter(
          ([, item]) => item,
        ),
      ) as Partial<Record<PlanCategory, PlanOption>>,
    }));
    onConfirm(result);
  }

  return (
    <main className="space-y-2 pb-24">
      <div className="bg-card px-4 py-5">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-tint-green text-primary">
            <Sprout className="size-5" aria-hidden />
          </span>
          <div>
            <h1 className="text-lg leading-snug font-black text-balance">{t('builderTitle')}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{t('builderHint')}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={selectAll}
          className="mt-4 text-xs font-bold text-primary underline underline-offset-2"
        >
          {t('quickFill')}
        </button>
      </div>

      {BASE_PLAN_TEMPLATE.map((day) => (
        <section key={day.day} className="bg-card px-4 py-4">
          <h2 className="text-sm font-black">{tDays(day.day)}</h2>

          <div className="mt-3 space-y-3">
            {PLAN_CATEGORIES.map((category) => {
              const key = cellKey(day.day, category);
              const custom = customOptions[key];
              const isAdding = addingKey === key;

              return (
                <div key={category} className="relative">
                  <p className="text-xs font-semibold text-muted-foreground">{t(CATEGORY_LABEL_KEY[category])}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    {[...day[category], ...(custom ? [custom] : [])].map((option) => {
                      const isSelected = selected[key]?.id === option.id;
                      return (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() => toggle(key, option)}
                          aria-pressed={isSelected}
                          className={cn(
                            'flex min-h-11 items-center gap-1.5 rounded-full border-2 px-3.5 text-sm font-semibold transition-colors',
                            isSelected
                              ? 'border-primary bg-primary text-primary-foreground'
                              : 'border-border bg-background text-foreground',
                          )}
                        >
                          {isSelected && <Check className="size-3.5" aria-hidden />}
                          {option.label[locale]}
                        </button>
                      );
                    })}

                    {!custom && (
                      <button
                        type="button"
                        onClick={() => (isAdding ? closeAdd() : openAdd(key))}
                        className="flex min-h-11 items-center gap-1 rounded-full border-2 border-dashed border-border px-3 text-sm font-semibold text-muted-foreground"
                      >
                        <Plus className="size-3.5" aria-hidden />
                        {t('addOwn')}
                      </button>
                    )}
                  </div>

                  {isAdding && (
                    <div className="mt-2 rounded-[var(--radius)] border border-border bg-card p-2 shadow-md">
                      <div className="input-3d flex h-11 items-center gap-2 rounded-[var(--radius)] border border-border/60 bg-background px-3">
                        <input
                          autoFocus
                          type="search"
                          value={query}
                          onChange={(event) => setQuery(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === 'Escape') closeAdd();
                          }}
                          placeholder={t('addOwnPlaceholder')}
                          className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                        />
                        <button
                          type="button"
                          onClick={closeAdd}
                          aria-label={t('addOwnPlaceholder')}
                          className="grid size-8 shrink-0 place-items-center text-muted-foreground"
                        >
                          <X className="size-4" aria-hidden />
                        </button>
                      </div>

                      {query.trim().length >= 2 && (
                        <ul className="mt-1.5 max-h-48 overflow-y-auto">
                          {searching && (
                            <li className="px-2 py-2 text-xs text-muted-foreground">…</li>
                          )}
                          {!searching && results.length === 0 && (
                            <li className="px-2 py-2 text-xs text-muted-foreground">{t('addOwnNoResults')}</li>
                          )}
                          {results.map((product) => (
                            <li key={product.id}>
                              <button
                                type="button"
                                onClick={() => pickResult(key, product)}
                                className="flex min-h-11 w-full items-center rounded-[var(--radius)] px-2 text-left text-sm hover:bg-tint-green"
                              >
                                {product.name}
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ))}

      <div
        className="fixed inset-x-0 z-30 mx-auto max-w-[480px] border-t border-border bg-card px-4 py-3"
        style={{ bottom: 'calc(var(--bottom-nav-height) + env(safe-area-inset-bottom, 0px))' }}
      >
        <button
          type="button"
          onClick={confirm}
          disabled={!allSelected}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-[var(--radius)] bg-primary text-sm font-bold text-primary-foreground disabled:opacity-40"
        >
          {t('confirmButton')} ({selectedCount}/{totalCells})
        </button>
      </div>
    </main>
  );
}
