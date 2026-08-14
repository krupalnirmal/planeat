'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Check, HelpCircle, Loader2, Trash2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import { CenteredState, PageHeader } from '@/components/shop/page-header';
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
  pricePaise: string | null;
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
        <main className="pb-2">
          <div className="bg-card px-4 py-8 text-sm text-muted-foreground">{tc('loading')}</div>
        </main>
      </>
    );
  }

  const items = list.data?.list.items ?? [];
  const usable = items.filter(
    (item) => item.status === 'MATCHED' || item.status === 'USER_CONFIRMED',
  ).length;

  if (items.length === 0) {
    return (
      <>
        <PageHeader title={t('reviewTitle')} backHref="/smart-list" backLabel={tc('back')} />
        <main className="pb-2">
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
      <main className="pb-2">
      <div className="bg-card px-4 py-4">
      {notice && (
        <p className="mb-4 rounded-[var(--radius)] bg-secondary px-3 py-2.5 text-sm">{notice}</p>
      )}
      {error && (
        <p className="mb-4 rounded-[var(--radius)] bg-danger/10 px-3 py-2.5 text-sm text-danger">
          {error}
        </p>
      )}

      <ul className="space-y-3">
        {items.map((item) => (
          <li
            key={item.id}
            className={cn('rounded-[var(--radius)] border p-3', TONE[item.status])}
          >
            <div className="flex items-start gap-2">
              <StatusIcon status={item.status} />

              <div className="min-w-0 flex-1">
                {/* What they actually said, always visible — it is how they
                    recognise the row. */}
                <p className="text-[11px] text-muted-foreground">“{item.rawText}”</p>

                <p className="mt-0.5 text-sm font-semibold">
                  {item.matchedName ?? item.parsedName ?? item.rawText}
                </p>

                <p className="text-xs text-muted-foreground">
                  {item.quantity && item.unit
                    ? formatQuantity(item.quantity, item.unit as QuantityUnit)
                    : null}
                  {item.pricePaise &&
                    ` · ${formatPaise(paise(item.pricePaise), { hidePaise: true })}`}
                  {/* M4 — a confidence score per item. */}
                  {item.status !== 'UNMATCHED' && ` · ${Math.round(item.confidence * 100)}%`}
                </p>

                <StatusLabel status={item.status} />
              </div>

              <button
                type="button"
                onClick={() => remove.mutate(item.id)}
                aria-label={t('removeItem')}
                className="grid size-11 shrink-0 place-items-center rounded-full text-muted-foreground"
              >
                <Trash2 className="size-4" aria-hidden />
              </button>
            </div>

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
        ))}
      </ul>
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

function StatusIcon({ status }: { status: ReviewItem['status'] }) {
  if (status === 'AMBIGUOUS') {
    return <HelpCircle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />;
  }
  if (status === 'UNMATCHED') {
    return <AlertCircle className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />;
  }
  return <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />;
}

/** Colour is never the only signal — every row says which state it is in. */
function StatusLabel({ status }: { status: ReviewItem['status'] }) {
  const t = useTranslations('smartList');

  const label =
    status === 'AMBIGUOUS'
      ? t('ambiguous')
      : status === 'UNMATCHED'
        ? t('unmatched')
        : t('matched');

  const tone =
    status === 'AMBIGUOUS'
      ? 'text-warning'
      : status === 'UNMATCHED'
        ? 'text-muted-foreground'
        : 'text-success';

  return <p className={cn('mt-1 text-[11px] font-semibold', tone)}>{label}</p>;
}
