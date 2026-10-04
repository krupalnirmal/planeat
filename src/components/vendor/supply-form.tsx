'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { api } from '@/lib/api/client';
import { rupeesToPaise } from '@/lib/money';

interface VariantOption {
  id: string;
  label: string;
  productName: string;
}

/**
 * A vendor reporting what they're delivering. This is a self-reported
 * claim only — it does not affect stock or the vendor's balance until an
 * admin confirms it (see `src/lib/admin/vendors.ts`'s `confirmSupply`).
 */
export function SupplyForm({ onDone }: { onDone: (message: string) => void }) {
  const t = useTranslations('vendor');
  const queryClient = useQueryClient();

  const products = useQuery({
    queryKey: ['vendor-products'],
    queryFn: () => api.get<{ variants: VariantOption[] }>('/api/vendor/products'),
  });

  const [variantId, setVariantId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [costPrice, setCostPrice] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = useMutation({
    mutationFn: () =>
      api.post('/api/vendor/supplies', {
        variantId,
        quantity: Number(quantity),
        costPricePaise: Number(rupeesToPaise(costPrice)),
      }),
    onSuccess: () => {
      setVariantId('');
      setQuantity('');
      setCostPrice('');
      void queryClient.invalidateQueries({ queryKey: ['vendor-supplies'] });
      onDone(t('supplySubmitted'));
    },
    onError: () => setError(t('supplyFailed')),
  });

  const canSubmit =
    variantId !== '' && Number(quantity) > 0 && Number(costPrice) > 0 && !submit.isPending;

  const variants = products.data?.variants ?? [];

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        submit.mutate();
      }}
      className="space-y-2.5 rounded-[var(--radius)] border border-border bg-card p-3"
    >
      <label className="block">
        <span className="text-xs font-medium text-muted-foreground">{t('product')}</span>
        <select
          required
          value={variantId}
          onChange={(event) => setVariantId(event.target.value)}
          className="mt-1 h-10 w-full rounded border border-border bg-background px-2 text-sm outline-none"
        >
          <option value="">{t('selectProduct')}</option>
          {variants.map((v) => (
            <option key={v.id} value={v.id}>
              {v.productName} ({v.label})
            </option>
          ))}
        </select>
      </label>

      <div className="grid grid-cols-2 gap-2.5">
        <label className="block">
          <span className="text-xs font-medium text-muted-foreground">{t('quantity')}</span>
          <input
            required
            inputMode="numeric"
            value={quantity}
            onChange={(event) => setQuantity(event.target.value.replace(/\D/g, ''))}
            className="mt-1 h-10 w-full rounded border border-border bg-background px-2 text-sm outline-none"
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-muted-foreground">{t('costPerUnit')}</span>
          <div className="mt-1 flex h-10 items-center gap-1 rounded border border-border bg-background px-2">
            <span className="text-sm text-muted-foreground">₹</span>
            <input
              required
              inputMode="decimal"
              value={costPrice}
              onChange={(event) => setCostPrice(event.target.value.replace(/[^\d.]/g, ''))}
              className="min-w-0 flex-1 bg-transparent text-sm outline-none"
            />
          </div>
        </label>
      </div>

      {error && <p className="text-xs font-medium text-danger">{error}</p>}

      <button
        type="submit"
        disabled={!canSubmit}
        className="flex h-10 w-full items-center justify-center gap-1.5 rounded-[var(--radius)] bg-primary text-sm font-bold text-primary-foreground disabled:opacity-50"
      >
        {submit.isPending && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
        {t('submitSupply')}
      </button>
    </form>
  );
}
