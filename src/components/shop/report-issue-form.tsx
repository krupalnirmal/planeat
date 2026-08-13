'use client';

import { useMutation } from '@tanstack/react-query';
import { Camera } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ApiClientError, api } from '@/lib/api/client';
import { formatPaise, paise, rupeesToPaise } from '@/lib/money';
import { cn } from '@/lib/utils';

/**
 * B14 — report a quality issue.
 *
 * A photo-backed complaint under ₹100 is auto-credited to the wallet, max 2
 * per customer per month. The form says so up front: a customer who knows the
 * photo is what unlocks the instant refund will take one, and that is better
 * for both sides than an argument over WhatsApp.
 *
 * Photo UPLOAD lands in Phase 8 with the admin media pipeline. Until then the
 * field accepts a URL, and a complaint without one goes to review — which is
 * exactly the behaviour B14 specifies for an unverifiable claim.
 */

const REASONS = [
  { code: 'QUALITY_POOR', key: 'reasonQualityPoor' },
  { code: 'ITEM_MISSING', key: 'reasonItemMissing' },
  { code: 'WRONG_ITEM', key: 'reasonWrongItem' },
  { code: 'QUANTITY_SHORT', key: 'reasonQuantityShort' },
  { code: 'DAMAGED', key: 'reasonDamaged' },
  { code: 'LATE_DELIVERY', key: 'reasonLateDelivery' },
  { code: 'OTHER', key: 'reasonOther' },
] as const;

type ReasonCode = (typeof REASONS)[number]['code'];

interface IssueResponse {
  autoApproved: boolean;
  creditedPaise: string;
}

export function ReportIssueForm({
  orderId,
  orderTotalPaise,
  onDone,
  onCancel,
}: {
  orderId: string;
  orderTotalPaise: string;
  onDone: (message: string) => void;
  onCancel: () => void;
}) {
  const t = useTranslations('issue');
  const tc = useTranslations('common');
  const te = useTranslations('errors');

  const [reasonCode, setReasonCode] = useState<ReasonCode>('QUALITY_POOR');
  const [description, setDescription] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState<string | null>(null);

  const maxPaise = paise(orderTotalPaise);

  const submit = useMutation({
    mutationFn: () => {
      // The claim can never exceed what the order was worth; the server caps
      // it too, but refusing here saves a pointless round trip.
      const claimed = amount ? rupeesToPaise(amount) : 0n;
      const capped = claimed > maxPaise ? maxPaise : claimed;

      return api.post<IssueResponse>(`/api/orders/${orderId}/issue`, {
        reasonCode,
        ...(description.trim() ? { description: description.trim() } : {}),
        photoUrls: photoUrl.trim() ? [photoUrl.trim()] : [],
        claimedPaise: Number(capped),
      });
    },
    onSuccess: (data) => {
      onDone(
        data.autoApproved
          ? t('autoCredited', { amount: formatPaise(paise(data.creditedPaise)) })
          : t('underReview'),
      );
    },
    onError: (err) => {
      setError(err instanceof ApiClientError ? err.message : te('generic'));
    },
  });

  return (
    <form
      className="rounded-[var(--radius)] border border-border bg-card p-4"
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        if (!submit.isPending) submit.mutate();
      }}
    >
      <h2 className="text-sm font-semibold">{t('title')}</h2>

      <fieldset className="mt-3">
        <legend className="sr-only">{t('title')}</legend>
        <div className="flex flex-wrap gap-2">
          {REASONS.map((reason) => (
            <button
              key={reason.code}
              type="button"
              onClick={() => setReasonCode(reason.code)}
              aria-pressed={reasonCode === reason.code}
              className={cn(
                'min-h-11 rounded-full border px-3 text-xs',
                reasonCode === reason.code
                  ? 'border-primary bg-primary text-primary-foreground font-semibold'
                  : 'border-border bg-background text-muted-foreground',
              )}
            >
              {t(reason.key)}
            </button>
          ))}
        </div>
      </fieldset>

      <label htmlFor="issue-description" className="mt-4 block text-sm font-medium">
        {t('description')}
      </label>
      <textarea
        id="issue-description"
        rows={3}
        value={description}
        onChange={(event) => setDescription(event.target.value.slice(0, 1000))}
        className="mt-1.5 w-full resize-none rounded-[var(--radius)] border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
      />

      <label htmlFor="issue-photo" className="mt-4 block text-sm font-medium">
        {t('photo')}
      </label>
      <div className="mt-1.5 flex items-center gap-2 rounded-[var(--radius)] border border-border bg-background px-3">
        <Camera className="size-4 shrink-0 text-primary" aria-hidden />
        <input
          id="issue-photo"
          type="url"
          inputMode="url"
          value={photoUrl}
          onChange={(event) => setPhotoUrl(event.target.value)}
          className="h-12 min-w-0 flex-1 bg-transparent text-sm outline-none"
        />
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">{t('photoHint')}</p>

      <label htmlFor="issue-amount" className="mt-4 block text-sm font-medium">
        {t('amount')}
      </label>
      <div className="mt-1.5 flex items-center gap-2 rounded-[var(--radius)] border border-border bg-background px-3">
        <span className="text-sm text-muted-foreground">₹</span>
        <input
          id="issue-amount"
          inputMode="decimal"
          value={amount}
          onChange={(event) => setAmount(event.target.value.replace(/[^\d.]/g, ''))}
          className="h-12 min-w-0 flex-1 bg-transparent text-sm outline-none"
        />
      </div>

      {error && <p className="mt-3 text-sm text-danger">{error}</p>}

      <div className="mt-4 flex gap-3">
        <button
          type="button"
          onClick={onCancel}
          className="h-12 flex-1 rounded-[var(--radius)] border border-border text-sm font-medium"
        >
          {tc('cancel')}
        </button>
        <button
          type="submit"
          disabled={submit.isPending || !amount}
          className="h-12 flex-1 rounded-[var(--radius)] bg-primary text-sm font-bold text-primary-foreground disabled:opacity-50"
        >
          {submit.isPending ? tc('saving') : t('submit')}
        </button>
      </div>
    </form>
  );
}
