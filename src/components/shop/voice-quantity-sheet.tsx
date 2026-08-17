'use client';

import { Loader2, Mic, X } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { Recorder } from '@/components/smart-list/recorder';
import { useCart } from '@/hooks/use-cart';
import { qs } from '@/lib/api/client';
import { combinePacks, type PackCombination } from '@/lib/catalog/pack-combination';
import { parseVoiceQuantity } from '@/lib/catalog/voice-quantity';
import { formatPaise } from '@/lib/money';
import { formatQuantity, type QuantityUnit } from '@/lib/quantity';
import type { UnitType } from '@/generated/prisma/enums';
import type { ProductRowVariant } from './product-row';

type Phase = 'record' | 'transcribing' | 'result' | 'error';
type ErrorKey = 'noQuantity' | 'noMatch';

/**
 * "अडीच किलो" → real packs, real price — the category row's voice-add
 * (`ProductRow`'s mic button opens this).
 *
 * Speaking a quantity for a product REPLACES whatever that product already
 * holds in the cart, the same as tapping a different weight chip does
 * (D-210) — `activeVariantIds` is cleared before the resolved combo is
 * added, so a product's cart state is always one deliberate choice, whether
 * that choice came from one tap or from a multi-pack voice bundle.
 */
export function VoiceQuantitySheet({
  productId,
  productName,
  productUnitType,
  variants,
  activeVariantIds,
  onClose,
}: {
  productId: string;
  productName: string;
  productUnitType: string;
  variants: ProductRowVariant[];
  activeVariantIds: string[];
  onClose: () => void;
}) {
  const t = useTranslations('product');
  const tc = useTranslations('common');
  const locale = useLocale();
  const cart = useCart();

  const [phase, setPhase] = useState<Phase>('record');
  const [transcript, setTranscript] = useState('');
  const [combo, setCombo] = useState<PackCombination | null>(null);
  const [errorKey, setErrorKey] = useState<ErrorKey>('noQuantity');

  async function handleRecorded(blob: Blob, mimeType: string) {
    setPhase('transcribing');
    try {
      const response = await fetch(`/api/voice/quantity${qs({ languageHint: locale })}`, {
        method: 'POST',
        headers: { 'content-type': mimeType },
        body: blob,
        credentials: 'same-origin',
      });
      const payload = await response.json();
      if (!payload.success) throw new Error(payload.error?.message ?? 'transcription failed');

      const heard: string = payload.data.transcript;
      setTranscript(heard);

      const parsed = parseVoiceQuantity(heard, productUnitType as UnitType);
      if (!parsed) {
        setErrorKey('noQuantity');
        setPhase('error');
        return;
      }

      const resolved = combinePacks(
        parsed.quantity,
        parsed.unit,
        variants.map((v) => ({
          id: v.id,
          quantity: v.quantity,
          unit: v.unit,
          pricePaise: BigInt(v.pricePaise),
          stockQty: v.stockQty,
        })),
      );

      if (!resolved) {
        setErrorKey('noMatch');
        setPhase('error');
        return;
      }

      setCombo(resolved);
      setPhase('result');
    } catch {
      setErrorKey('noQuantity');
      setPhase('error');
    }
  }

  function confirmAdd() {
    if (!combo) return;
    for (const variantId of activeVariantIds) cart.remove(variantId);
    for (const line of combo.lines) {
      cart.add({ productId, variantId: line.variantId, quantity: line.count });
    }
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40">
      <div className="w-full max-w-[480px] rounded-t-[calc(var(--radius)*1.6)] bg-background p-5 pb-8">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-bold">
            {t('voiceQuantity.sheetTitle', { product: productName })}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={tc('close')}
            className="grid size-11 place-items-center rounded-full"
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>

        {phase === 'record' && (
          <>
            <p className="mb-3 text-center text-xs text-muted-foreground">
              {t('voiceQuantity.hint')}
            </p>
            <Recorder onRecorded={handleRecorded} />
          </>
        )}

        {phase === 'transcribing' && (
          <div className="py-8 text-center">
            <Loader2 className="mx-auto size-8 animate-spin text-primary" aria-hidden />
            <p className="mt-3 text-sm font-medium">{tc('loading')}</p>
          </div>
        )}

        {phase === 'result' && combo && (
          <div className="py-2">
            <p className="mb-3 text-center text-xs text-muted-foreground">
              {t('voiceQuantity.heard', { transcript })}
            </p>
            <div className="rounded-[var(--radius)] border border-border bg-card p-4 text-center">
              <p className="text-lg font-bold">
                {formatQuantity(combo.totalQuantity, combo.unit as QuantityUnit)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {combo.lines
                  .map(
                    (line) =>
                      `${line.count} × ${formatQuantity(line.quantity, line.unit as QuantityUnit)}`,
                  )
                  .join(' + ')}
              </p>
              <p className="mt-2 text-sm font-bold text-primary-dark">
                {formatPaise(combo.totalPricePaise, { hidePaise: true })}
              </p>
            </div>

            <button
              type="button"
              onClick={confirmAdd}
              className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-[var(--radius)] bg-primary text-sm font-bold text-primary-foreground"
            >
              {t('voiceQuantity.confirmAdd', {
                total: formatPaise(combo.totalPricePaise, { hidePaise: true }),
              })}
            </button>
            <button
              type="button"
              onClick={() => setPhase('record')}
              className="mt-2 flex h-11 w-full items-center justify-center text-sm font-semibold text-muted-foreground"
            >
              {t('voiceQuantity.tryAgain')}
            </button>
          </div>
        )}

        {phase === 'error' && (
          <div className="py-6 text-center">
            <p className="text-sm font-semibold text-danger">
              {t(`voiceQuantity.${errorKey}`)}
            </p>
            <button
              type="button"
              onClick={() => setPhase('record')}
              className="mt-5 flex h-11 w-full items-center justify-center gap-2 rounded-[var(--radius)] border border-primary text-sm font-bold text-primary"
            >
              <Mic className="size-4" aria-hidden />
              {t('voiceQuantity.tryAgain')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
