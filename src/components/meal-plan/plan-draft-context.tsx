'use client';

import { useQuery } from '@tanstack/react-query';
import { useLocale } from 'next-intl';
import { createContext, useContext, useMemo, useState } from 'react';
import { api, qs } from '@/lib/api/client';
import { paise } from '@/lib/money';

/**
 * Shared draft state for the day-by-day plan builder wizard
 * (`/meal-plan/build`, `/meal-plan/build/[day]`, `/meal-plan/build/summary`).
 *
 * The real save contract (`PUT /api/meal-plan/current`) always replaces the
 * whole week atomically — there is no per-day save endpoint — so editing
 * across several screens needs one shared in-memory draft that only actually
 * reaches the server once, from the weekly-overview screen's "Confirm & Save
 * Plan". This provider holds that draft; every wizard screen reads and edits
 * it through `usePlanDraft()` instead of re-fetching or re-deriving it.
 *
 * Mounted once in `build/layout.tsx`, so it survives client-side navigation
 * between the wizard's three routes (Next.js keeps a layout's component tree
 * mounted across nested route changes) without any extra persistence layer.
 */

export interface DraftVariant {
  id: string;
  label: string;
  pricePaise: string;
}

export interface DraftProduct {
  id: string;
  name: string;
  /** English name — shown together with `localName` as "English (local)",
      matching the storefront's own product card. Optional so a curated
      list that hasn't been updated still renders using `name` alone. */
  nameEn?: string;
  /** Always the Marathi name, regardless of the UI's own current locale. */
  localName?: string | null;
  imageUrl: string | null;
  variants: DraftVariant[];
}

export interface DraftColumn {
  slug: string;
  name: string;
  iconUrl: string | null;
  products: DraftProduct[];
}

interface PlanCurrentResponse {
  plan: {
    id: string;
    days: Array<{ dayOfWeek: number; items: Array<{ productId: string; variantId: string }> }>;
  } | null;
  columns: DraftColumn[];
  dailyEssentials: DraftProduct[];
  sprouts: DraftProduct[];
  hasActiveSubscription: boolean;
}

export const DAYS = [1, 2, 3, 4, 5, 6, 7] as const;

/** `{ [dayOfWeek]: { [productId]: variantId } }` — the whole week's draft. */
type Selections = Record<number, Record<string, string>>;

function emptySelections(): Selections {
  const selections: Selections = {};
  for (const day of DAYS) selections[day] = {};
  return selections;
}

interface PlanDraftContextValue {
  loading: boolean;
  loaded: boolean;
  allColumns: DraftColumn[];
  selections: Selections;
  setItem: (dayOfWeek: number, productId: string, variantId: string | null) => void;
  productOf: (productId: string) => DraftProduct | undefined;
  variantOf: (productId: string, variantId: string) => DraftVariant | undefined;
  itemCount: (dayOfWeek: number) => number;
  dayTotalPaise: (dayOfWeek: number) => bigint;
  weekItemCount: () => number;
  weekTotalPaise: () => bigint;
  hasActiveSubscription: boolean;
  /** `PUT /api/meal-plan/current`'s exact body shape — built fresh from the
      current draft, so the summary screen's save mutation never has to know
      the selections' internal representation. */
  buildSavePayload: () => Array<{ dayOfWeek: number; variantIds: string[] }>;
}

const PlanDraftContext = createContext<PlanDraftContextValue | null>(null);

export function PlanDraftProvider({ children }: { children: React.ReactNode }) {
  const locale = useLocale();
  const [selections, setSelections] = useState<Selections>(emptySelections);
  const [seededFor, setSeededFor] = useState<string | null>(null);

  const current = useQuery({
    queryKey: ['meal-plan-current', locale],
    queryFn: () => api.get<PlanCurrentResponse>(`/api/meal-plan/current${qs({ locale })}`),
  });

  const data = current.data;

  // Seed the draft from whatever is already saved — once per fetched plan
  // identity, so a background refetch (React Query's default behaviour on
  // window focus) can never clobber picks the customer is mid-edit on.
  const planKey = data?.plan?.id ?? (data ? 'new' : null);
  if (planKey && planKey !== seededFor) {
    const seeded = emptySelections();
    for (const day of data?.plan?.days ?? []) {
      for (const item of day.items) seeded[day.dayOfWeek][item.productId] = item.variantId;
    }
    setSelections(seeded);
    setSeededFor(planKey);
  }

  const allColumns = useMemo<DraftColumn[]>(() => {
    if (!data) return [];
    const curated: DraftColumn[] = [
      { slug: '__daily_essentials__', name: '', iconUrl: null, products: data.dailyEssentials },
      { slug: '__sprouts__', name: '', iconUrl: null, products: data.sprouts },
    ].filter((c) => c.products.length > 0);
    return [...data.columns, ...curated];
  }, [data]);

  const productIndex = useMemo(() => {
    const map = new Map<string, DraftProduct>();
    for (const column of allColumns) {
      for (const product of column.products) map.set(product.id, product);
    }
    return map;
  }, [allColumns]);

  function productOf(productId: string) {
    return productIndex.get(productId);
  }

  function variantOf(productId: string, variantId: string) {
    return productIndex.get(productId)?.variants.find((v) => v.id === variantId);
  }

  function setItem(dayOfWeek: number, productId: string, variantId: string | null) {
    setSelections((prev) => {
      const day = { ...prev[dayOfWeek] };
      if (variantId) day[productId] = variantId;
      else delete day[productId];
      return { ...prev, [dayOfWeek]: day };
    });
  }

  function itemCount(dayOfWeek: number): number {
    return Object.keys(selections[dayOfWeek] ?? {}).length;
  }

  function dayTotalPaise(dayOfWeek: number): bigint {
    const day = selections[dayOfWeek] ?? {};
    return Object.entries(day).reduce((sum, [productId, variantId]) => {
      const variant = variantOf(productId, variantId);
      return variant ? sum + paise(variant.pricePaise) : sum;
    }, 0n);
  }

  function weekItemCount(): number {
    return DAYS.reduce((sum, day) => sum + itemCount(day), 0);
  }

  function weekTotalPaise(): bigint {
    return DAYS.reduce((sum, day) => sum + dayTotalPaise(day), 0n);
  }

  function buildSavePayload() {
    return DAYS.map((dayOfWeek) => ({
      dayOfWeek,
      variantIds: Object.values(selections[dayOfWeek] ?? {}),
    }));
  }

  const value: PlanDraftContextValue = {
    loading: current.isLoading,
    loaded: data !== undefined,
    allColumns,
    selections,
    setItem,
    productOf,
    variantOf,
    itemCount,
    dayTotalPaise,
    weekItemCount,
    weekTotalPaise,
    hasActiveSubscription: data?.hasActiveSubscription ?? false,
    buildSavePayload,
  };

  return <PlanDraftContext.Provider value={value}>{children}</PlanDraftContext.Provider>;
}

export function usePlanDraft(): PlanDraftContextValue {
  const ctx = useContext(PlanDraftContext);
  if (!ctx) throw new Error('usePlanDraft must be used within PlanDraftProvider');
  return ctx;
}
