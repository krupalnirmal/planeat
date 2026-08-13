'use client';

import { useMutation } from '@tanstack/react-query';
import { Check, ImageIcon, Loader2, X } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { ApiClientError, api, qs } from '@/lib/api/client';
import { formatPaise, paise } from '@/lib/money';
import { formatQuantity, type QuantityUnit } from '@/lib/quantity';
import { cn } from '@/lib/utils';

/**
 * B6 — the swap flow: reason → 3 AI alternatives → pick → applied instantly.
 *
 * There is no approval step and no waiting. Removing the dietitian was the
 * point; rebuilding the approval wait would automate the paperwork and keep the
 * bottleneck.
 */

const REASONS = [
  'DONT_LIKE',
  'ALLERGIC',
  'NOT_AVAILABLE',
  'TOO_EXPENSIVE',
  'OTHER',
] as const;

type ReasonCode = (typeof REASONS)[number];

/** B6 — the rejected vegetable is remembered only when the reason meant it. */
const LEARNING_REASONS: ReadonlySet<ReasonCode> = new Set(['DONT_LIKE', 'ALLERGIC']);

interface Suggestion {
  productId: string;
  name: string;
  imageUrl: string | null;
  reason: string;
  quantity: number;
  unit: string;
  pricePaise: string | null;
}

interface SuggestResponse {
  swapRequestId: string;
  replacing: string;
  suggestions: Suggestion[];
}

export function SwapSheet({
  mealPlanId,
  itemId,
  currentName,
  onClose,
  onApplied,
}: {
  mealPlanId: string;
  itemId: string;
  currentName: string;
  onClose: () => void;
  onApplied: () => void;
}) {
  const t = useTranslations('swap');
  const tc = useTranslations('common');
  const locale = useLocale();

  const [reasonCode, setReasonCode] = useState<ReasonCode>('DONT_LIKE');
  const [reasonText, setReasonText] = useState('');
  const [chosen, setChosen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const suggest = useMutation({
    mutationFn: () =>
      api.post<SuggestResponse>(
        `/api/meal-plan/${mealPlanId}/items/${itemId}/swap${qs({ locale })}`,
        { reasonCode, ...(reasonText.trim() ? { reasonText: reasonText.trim() } : {}) },
      ),
    onError: (err) => {
      if (err instanceof ApiClientError) {
        if (err.code === 'RATE_LIMITED') {
          const details = err.details as { used?: number; limit?: number } | undefined;
          setError(t('limitReached', { used: details?.used ?? 0, limit: details?.limit ?? 10 }));
          return;
        }
        if (err.code === 'BAD_REQUEST') {
          setError(t('noAlternatives'));
          return;
        }
      }
      setError(t('failed'));
    },
  });

  const confirm = useMutation({
    mutationFn: (productId: string) =>
      api.post(`/api/meal-plan/swap/confirm${qs({ locale })}`, {
        swapRequestId: suggest.data?.swapRequestId,
        productId,
      }),
    onSuccess: () => {
      onApplied();
      onClose();
    },
    onError: (err) => {
      setError(err instanceof ApiClientError ? err.message : t('failed'));
    },
  });

  const suggestions = suggest.data?.suggestions ?? [];

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40">
      <div className="max-h-[85vh] w-full max-w-[480px] overflow-y-auto rounded-t-[calc(var(--radius)*1.6)] bg-background p-5 pb-8">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-bold">{t('title')}</h2>
            <p className="mt-0.5 truncate text-sm text-muted-foreground">
              {t('replacing', { name: currentName })}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={tc('close')}
            className="grid size-11 shrink-0 place-items-center rounded-full"
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>

        {suggestions.length === 0 ? (
          <>
            <fieldset>
              <legend className="text-sm font-medium">{t('why')}</legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {REASONS.map((code) => (
                  <button
                    key={code}
                    type="button"
                    onClick={() => setReasonCode(code)}
                    aria-pressed={reasonCode === code}
                    className={cn(
                      'min-h-11 rounded-full border px-3.5 text-sm transition-colors',
                      reasonCode === code
                        ? 'border-primary bg-primary text-primary-foreground font-semibold'
                        : 'border-border bg-card text-muted-foreground',
                    )}
                  >
                    {t(`reason${code}`)}
                  </button>
                ))}
              </div>
            </fieldset>

            {reasonCode === 'OTHER' && (
              <div className="mt-4">
                <label htmlFor="swap-reason" className="text-sm font-medium">
                  {t('reasonText')}
                </label>
                <input
                  id="swap-reason"
                  value={reasonText}
                  onChange={(event) => setReasonText(event.target.value.slice(0, 255))}
                  className="mt-1.5 h-12 w-full rounded-[var(--radius)] border border-border bg-card px-3 text-base outline-none focus:border-primary"
                />
              </div>
            )}

            {/* B6 — telling the customer the consequence before they act. A
                dislike is remembered; "wasn't available" is not. */}
            {LEARNING_REASONS.has(reasonCode) && (
              <p className="mt-3 text-xs text-muted-foreground">{t('learnNote')}</p>
            )}

            {error && <p className="mt-4 text-sm text-danger">{error}</p>}

            <button
              type="button"
              onClick={() => {
                setError(null);
                suggest.mutate();
              }}
              disabled={suggest.isPending}
              className="mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-[var(--radius)] bg-primary text-sm font-bold text-primary-foreground disabled:opacity-50"
            >
              {suggest.isPending && <Loader2 className="size-4 animate-spin" aria-hidden />}
              {suggest.isPending ? t('finding') : t('findAlternatives')}
            </button>
          </>
        ) : (
          <>
            <p className="text-sm font-medium">{t('chooseOne')}</p>

            <ul className="mt-3 space-y-2">
              {suggestions.map((suggestion) => (
                <li key={suggestion.productId}>
                  <button
                    type="button"
                    onClick={() => setChosen(suggestion.productId)}
                    aria-pressed={chosen === suggestion.productId}
                    className={cn(
                      'flex w-full gap-3 rounded-[var(--radius)] border p-3 text-left transition-colors',
                      chosen === suggestion.productId
                        ? 'border-primary bg-primary/5'
                        : 'border-border bg-card',
                    )}
                  >
                    <span className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-[calc(var(--radius)-6px)] bg-secondary">
                      {suggestion.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={suggestion.imageUrl}
                          alt=""
                          aria-hidden
                          className="size-full object-cover"
                        />
                      ) : (
                        <ImageIcon className="size-5 text-muted-foreground/40" aria-hidden />
                      )}
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold">{suggestion.name}</span>
                      <span className="block text-xs text-muted-foreground">
                        {formatQuantity(suggestion.quantity, suggestion.unit as QuantityUnit)}
                        {suggestion.pricePaise &&
                          ` · ${formatPaise(paise(suggestion.pricePaise), { hidePaise: true })}`}
                      </span>
                      <span className="mt-1 block text-xs leading-relaxed text-muted-foreground italic">
                        {suggestion.reason}
                      </span>
                    </span>

                    {chosen === suggestion.productId && (
                      <Check className="mt-1 size-5 shrink-0 text-primary" aria-hidden />
                    )}
                  </button>
                </li>
              ))}
            </ul>

            {error && <p className="mt-4 text-sm text-danger">{error}</p>}

            <button
              type="button"
              onClick={() => {
                setError(null);
                if (chosen) confirm.mutate(chosen);
              }}
              disabled={!chosen || confirm.isPending}
              className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-[var(--radius)] bg-primary text-sm font-bold text-primary-foreground disabled:opacity-50"
            >
              {confirm.isPending && <Loader2 className="size-4 animate-spin" aria-hidden />}
              {confirm.isPending ? t('applying') : t('apply')}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
