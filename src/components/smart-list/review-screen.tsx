'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Check, HelpCircle, ImageIcon, Loader2, Pencil, ShoppingCart, Trash2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import { CenteredState, PageHeader } from '@/components/shop/page-header';
import { QtyStepper } from '@/components/shop/qty-stepper';
import { api, qs } from '@/lib/api/client';
import { formatPaise, paise } from '@/lib/money';
import { formatQuantity, type QuantityUnit } from '@/lib/quantity';
import { cn } from '@/lib/utils';

/**
 * M4's review screen.
 *
 *   "Review screen colour-codes: matched (green), ambiguous (amber, tap to
 *    choose from top 3), unmatched (grey, 'not available'). Confidence score
 *    per item."
 *
 * The colour is never the only signal — every row carries a word and an icon
 * too. A red-green colour-blind customer, or anyone reading this in sunlight
 * on a cheap screen, must still be able to tell an amber row from a green one.
 */

interface Alternative {
  productId: string;
  variantId: string | null;
  name: string;
  pricePaise: string | null;
  inStock: boolean;
  confidence: number;
}

interface ReviewItem {
  id: string;
  rawText: string;
  parsedName: string | null;
  quantity: number | null;
  unit: string | null;
  matchedProductId: string | null;
  matchedName: string | null;
  imageUrl: string | null;
  variantLabel: string | null;
  variantBaseQuantity: number | null;
  pricePaise: string | null;
  packCount: number;
  linePricePaise: string | null;
  unitRatePaise: string | null;
  unitRateSuffix: string | null;
  inStock: boolean;
  confidence: number;
  status: 'MATCHED' | 'AMBIGUOUS' | 'UNMATCHED' | 'USER_CONFIRMED';
  alternatives: Alternative[];
}

interface ListResponse {
  list: {
    id: string;
    source: string;
    transcript: string | null;
    name: string | null;
    items: ReviewItem[];
  };
}

const TONE: Record<ReviewItem['status'], string> = {
  MATCHED: 'border-success/40 bg-primary/5',
  USER_CONFIRMED: 'border-success/40 bg-primary/5',
  AMBIGUOUS: 'border-warning/40 bg-[#FDF3E3]',
  UNMATCHED: 'border-border bg-secondary',
};

export function SmartListReview({ smartListId }: { smartListId: string }) {
  const t = useTranslations('smartList');
  const tc = useTranslations('common');
  const te = useTranslations('errors');
  const locale = useLocale();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const list = useQuery({
    queryKey: ['smart-list', smartListId, locale],
    queryFn: () => api.get<ListResponse>(`/api/smart-list/${smartListId}${qs({ locale })}`),
  });

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ['smart-list', smartListId] });
  }

  const choose = useMutation({
    mutationFn: (input: { itemId: string; productId: string; variantId: string | null }) =>
      api.patch(`/api/smart-list/${smartListId}/items/${input.itemId}`, {
        productId: input.productId,
        variantId: input.variantId,
      }),
    onSuccess: refresh,
    onError: () => setError(te('generic')),
  });

  const remove = useMutation({
    mutationFn: (itemId: string) =>
      api.patch(`/api/smart-list/${smartListId}/items/${itemId}`, { remove: true }),
    onSuccess: refresh,
    onError: () => setError(te('generic')),
  });

  // The stepper counts packs of the matched variant, not raw grams — see
  // `units.ts`'s own doc comment. `variantBaseQuantity` is the variant's
  // pack size already expressed in the item's own base unit, so the new
  // quantity to PATCH is just `packCount × that`, no unit conversion here.
  const setPackCount = useMutation({
    mutationFn: (input: { itemId: string; quantity: number }) =>
      api.patch(`/api/smart-list/${smartListId}/items/${input.itemId}`, {
        quantity: input.quantity,
      }),
    onSuccess: refresh,
    onError: () => setError(te('generic')),
  });

  const toCart = useMutation({
    mutationFn: () =>
      api.post<{ added: number; skipped: Array<{ name: string }> }>(
        `/api/smart-list/${smartListId}/to-cart${qs({ locale })}`,
      ),
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: ['cart'] });
      if (data.skipped.length > 0) {
        // M4 — never silently dropped. If some rows did not make it, say so
        // here rather than letting the customer discover it in the cart.
        setNotice(
          `${t('addedCount', { count: data.added })} · ${t('skippedCount', { count: data.skipped.length })}`,
        );
      } else {
        router.push('/cart');
      }
    },
    onError: () => setError(t('failed')),
  });

  if (list.isLoading) {
    return (
      <>
        <PageHeader title={t('reviewTitle')} backHref="/smart-list" backLabel={tc('back')} />
        <main className="pb-2 lg:mx-auto lg:max-w-2xl">
          <div className="bg-card px-4 py-8 text-sm text-muted-foreground">{tc('loading')}</div>
        </main>
      </>
    );
  }

  const items = list.data?.list.items ?? [];
  const usableItems = items.filter(
    (item) => item.status === 'MATCHED' || item.status === 'USER_CONFIRMED',
  );
  const usable = usableItems.length;
  const estimatedTotalPaise = usableItems.reduce(
    (sum, item) => sum + paise(item.linePricePaise ?? '0'),
    0n,
  );

  if (items.length === 0) {
    return (
      <>
        <PageHeader title={t('reviewTitle')} backHref="/smart-list" backLabel={tc('back')} />
        <main className="pb-2 lg:mx-auto lg:max-w-2xl">
          <div className="bg-card">
            <CenteredState>
              <AlertCircle className="size-10 text-muted-foreground/40" aria-hidden />
              <p className="mt-4 text-sm font-medium">{t('emptyList')}</p>
              <p className="mt-1 text-xs text-muted-foreground">{t('emptyPhotoHint')}</p>
              <button
                type="button"
                onClick={() => router.push('/smart-list')}
                className="mt-6 h-12 w-full max-w-xs rounded-[var(--radius)] bg-primary text-sm font-bold text-primary-foreground"
              >
                {t('typeInstead')}
              </button>
            </CenteredState>
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <PageHeader title={t('reviewTitle')} subtitle={t('reviewHint')} backHref="/smart-list" backLabel={tc('back')} />
      <main className="pb-2 lg:mx-auto lg:max-w-2xl">
      <div className="bg-card px-4 py-4">
      <ListNameEditor smartListId={smartListId} name={list.data?.list.name ?? null} />
      {notice && (
        <p className="mb-4 rounded-[var(--radius)] bg-secondary px-3 py-2.5 text-sm">{notice}</p>
      )}
      {error && (
        <p className="mb-4 rounded-[var(--radius)] bg-danger/10 px-3 py-2.5 text-sm text-danger">
          {error}
        </p>
      )}

      <ul className="space-y-3">
        {items.map((item) => {
          const matched = item.status === 'MATCHED' || item.status === 'USER_CONFIRMED';
          return (
            <li key={item.id} className={cn('rounded-[var(--radius)] border p-3', TONE[item.status])}>
              <div className="flex items-start gap-3">
                {/* Real product photo (session 2026-09-23, client reference
                    screenshot) — the matched product's own first image,
                    same source `ProductCard` reads. A plain icon for an
                    unmatched row, which has no real product to show. */}
                <div className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-[var(--radius)] bg-white">
                  {item.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.imageUrl} alt="" className="size-full object-cover" />
                  ) : (
                    <ImageIcon className="size-6 text-muted-foreground/40" aria-hidden />
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  {/* What they actually said stays the headline — it is how
                      they recognise the row; the real matched product name
                      rides underneath as confirmation. */}
                  <p className="truncate text-sm font-bold">
                    {item.parsedName ?? item.rawText}
                  </p>
                  {item.matchedName ? (
                    <p className="truncate text-xs text-muted-foreground">{item.matchedName}</p>
                  ) : (
                    <p className="text-[11px] text-muted-foreground">“{item.rawText}”</p>
                  )}

                  {/* Real per-kg/per-litre/per-count unit pricing, derived
                      from the matched variant's own price and pack size
                      (units.ts) — not fabricated. */}
                  {item.variantLabel && item.unitRatePaise && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {item.variantLabel} ·{' '}
                      {formatPaise(paise(item.unitRatePaise), { hidePaise: true })}/
                      {item.unitRateSuffix}
                    </p>
                  )}

                  <StatusBadge status={item.status} confidence={item.confidence} />
                </div>

                <div className="flex shrink-0 flex-col items-end gap-1">
                  <button
                    type="button"
                    onClick={() => remove.mutate(item.id)}
                    aria-label={t('removeItem')}
                    className="grid size-9 shrink-0 place-items-center rounded-full border border-border text-muted-foreground"
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </button>

                  {matched && item.linePricePaise && (
                    <>
                      <p className="text-sm font-bold">
                        {formatPaise(paise(item.linePricePaise), { hidePaise: true })}
                      </p>
                      {item.quantity && item.unit && (
                        <p className="text-[11px] text-muted-foreground">
                          ({formatQuantity(item.quantity, item.unit as QuantityUnit)})
                        </p>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* Pack-count stepper — real quantity editing, PATCHing the
                  same endpoint the alternatives picker below already uses. */}
              {matched && item.variantBaseQuantity && (
                <div className="mt-2 flex justify-end">
                  <QtyStepper
                    size="sm"
                    tone="tint"
                    quantity={item.packCount}
                    label={item.matchedName ?? undefined}
                    disabled={setPackCount.isPending}
                    onDecrement={() =>
                      item.packCount > 1 &&
                      setPackCount.mutate({
                        itemId: item.id,
                        quantity: (item.packCount - 1) * item.variantBaseQuantity!,
                      })
                    }
                    onIncrement={() =>
                      setPackCount.mutate({
                        itemId: item.id,
                        quantity: (item.packCount + 1) * item.variantBaseQuantity!,
                      })
                    }
                  />
                </div>
              )}

              {/* M4 — ambiguous rows offer the top 3. */}
              {item.status === 'AMBIGUOUS' && item.alternatives.length > 0 && (
                <ul className="mt-3 flex flex-wrap gap-2">
                  {item.alternatives.map((alternative) => (
                    <li key={alternative.productId}>
                      <button
                        type="button"
                        onClick={() =>
                          choose.mutate({
                            itemId: item.id,
                            productId: alternative.productId,
                            variantId: alternative.variantId,
                          })
                        }
                        disabled={!alternative.inStock || choose.isPending}
                        className="min-h-11 rounded-full border border-border bg-background px-3 text-xs font-medium disabled:opacity-50"
                      >
                        {alternative.name}
                        {alternative.pricePaise && (
                          <span className="ml-1.5 text-muted-foreground">
                            {formatPaise(paise(alternative.pricePaise), { hidePaise: true })}
                          </span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>

      {/* Summary strip (session 2026-09-23, client reference) — a real
          running total (sum of each matched row's own line price), not a
          guess, shown above the confirm button. */}
      {usable > 0 && (
        <div className="mt-4 flex items-center gap-3 rounded-[var(--radius)] bg-tint-green px-4 py-3">
          <ShoppingCart className="size-5 shrink-0 text-primary" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-primary-dark">
              {t('itemsSelected', { count: usable })}
            </p>
            <p className="text-xs text-primary-dark/70">{t('estimatedTotal')}</p>
          </div>
          <p className="text-base font-black text-primary-dark">
            {formatPaise(estimatedTotalPaise, { hidePaise: true })}
          </p>
        </div>
      )}
      </div>

      <div
        className="fixed inset-x-0 z-30 mx-auto max-w-[480px] border-t border-border bg-card px-4 py-3"
        style={{ bottom: 'calc(var(--bottom-nav-height) + env(safe-area-inset-bottom, 0px))' }}
      >
        <button
          type="button"
          onClick={() => {
            setError(null);
            toCart.mutate();
          }}
          disabled={usable === 0 || toCart.isPending}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-[var(--radius)] bg-primary text-sm font-bold text-primary-foreground disabled:opacity-50"
        >
          {toCart.isPending && <Loader2 className="size-4 animate-spin" aria-hidden />}
          {toCart.isPending ? t('addingToCart') : `${t('addToCart')} (${usable})`}
        </button>
      </div>

      <div aria-hidden className="h-16" />
      </main>
    </>
  );
}

/** M4 — "Saved lists — name and reuse ('Weekly Sabzi')." Every list is
    already saved and reusable the moment it's created (`smart-list-screen.
    tsx`'s own saved-lists section reads real rows); this is just the
    missing UI for the rename half of that — the `PATCH /api/smart-list/:id`
    route and the `saveList`/`listName`/`listNamePlaceholder` strings it uses
    already existed, unused, before this. */
function ListNameEditor({ smartListId, name }: { smartListId: string; name: string | null }) {
  const t = useTranslations('smartList');
  const tc = useTranslations('common');
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name ?? '');

  const rename = useMutation({
    mutationFn: (newName: string) => api.patch(`/api/smart-list/${smartListId}`, { name: newName }),
    onSuccess: () => {
      setEditing(false);
      void queryClient.invalidateQueries({ queryKey: ['smart-list', smartListId] });
      void queryClient.invalidateQueries({ queryKey: ['smart-lists'] });
    },
  });

  if (editing) {
    return (
      <div className="mb-4 flex items-center gap-2">
        <input
          value={value}
          onChange={(event) => setValue(event.target.value.slice(0, 120))}
          placeholder={t('listNamePlaceholder')}
          autoFocus
          className="input-3d min-w-0 flex-1 rounded-[var(--radius)] border border-border/60 bg-background px-3 py-2 text-sm outline-none focus:border-primary"
        />
        <button
          type="button"
          onClick={() => {
            setEditing(false);
            setValue(name ?? '');
          }}
          className="h-10 shrink-0 rounded-[var(--radius)] border border-border px-3 text-xs font-semibold"
        >
          {tc('cancel')}
        </button>
        <button
          type="button"
          onClick={() => value.trim() && rename.mutate(value.trim())}
          disabled={!value.trim() || rename.isPending}
          className="h-10 shrink-0 rounded-[var(--radius)] bg-primary px-3 text-xs font-bold text-primary-foreground disabled:opacity-50"
        >
          {rename.isPending ? tc('saving') : tc('save')}
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className="mb-4 flex items-center gap-1.5 text-sm font-semibold text-primary"
    >
      <Pencil className="size-3.5 shrink-0" aria-hidden />
      {name ?? t('saveList')}
    </button>
  );
}

/** Colour is never the only signal (M4) — every row carries an icon and a
    word too, restyled (session 2026-09-23, client reference screenshot)
    from a plain icon+text line into a pill badge, with the real confidence
    score alongside it for matched rows. */
function StatusBadge({ status, confidence }: { status: ReviewItem['status']; confidence: number }) {
  const t = useTranslations('smartList');

  const Icon = status === 'AMBIGUOUS' ? HelpCircle : status === 'UNMATCHED' ? AlertCircle : Check;
  const label =
    status === 'AMBIGUOUS' ? t('ambiguous') : status === 'UNMATCHED' ? t('unmatched') : t('matched');
  const tone =
    status === 'AMBIGUOUS'
      ? 'bg-warning/10 text-warning'
      : status === 'UNMATCHED'
        ? 'bg-secondary text-muted-foreground'
        : 'bg-success/10 text-success';

  return (
    <p className="mt-1 flex items-center gap-1.5">
      <span className={cn('flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold', tone)}>
        <Icon className="size-3 shrink-0" aria-hidden />
        {label}
      </span>
      {status !== 'UNMATCHED' && (
        <span className="text-[11px] text-muted-foreground">
          {t('matchPercent', { percent: Math.round(confidence * 100) })}
        </span>
      )}
    </p>
  );
}
