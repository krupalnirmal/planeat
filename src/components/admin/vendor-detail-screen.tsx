'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import { AdminPageHeader } from '@/components/admin/admin-shell';
import { ApiClientError, api } from '@/lib/api/client';
import { formatPaise, paise, rupeesToPaise } from '@/lib/money';
import { cn } from '@/lib/utils';

/**
 * A vendor's profile, pending supplies to confirm/reject, supply history,
 * and the ledger/payment control — the detail page `AdminVendorsScreen`'s
 * list links to. Mirrors `CustomerDetailScreen`'s general shape, kept to
 * plain bordered cards (not that page's colour-coded IconCircle treatment)
 * to match `delivery-partners-screen.tsx`'s simpler aesthetic instead.
 */

interface VendorDetail {
  id: string;
  name: string;
  phone: string;
  businessName: string;
  isActive: boolean;
  balancePaise: string;
}

interface SupplyRow {
  id: string;
  productName: string;
  variantLabel: string;
  quantity: number;
  costPricePaise: string;
  status: 'PENDING' | 'CONFIRMED' | 'REJECTED';
  rejectionReason: string | null;
  createdAt: string;
  confirmedAt: string | null;
}

export function VendorDetailScreen({ vendorId }: { vendorId: string }) {
  const t = useTranslations('admin.vendors');
  const tc = useTranslations('admin.common');
  const format = useFormatter();
  const queryClient = useQueryClient();

  const detail = useQuery({
    queryKey: ['admin-vendor', vendorId],
    queryFn: () =>
      api.get<{ vendor: VendorDetail; supplies: SupplyRow[] }>(`/api/admin/vendors/${vendorId}`),
  });

  const review = useMutation({
    mutationFn: ({
      supplyId,
      action,
      rejectionReason,
    }: {
      supplyId: string;
      action: 'confirm' | 'reject';
      rejectionReason?: string;
    }) => api.patch(`/api/admin/vendors/${vendorId}/supplies/${supplyId}`, { action, rejectionReason }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['admin-vendor', vendorId] }),
  });

  if (detail.isLoading) {
    return (
      <>
        <AdminPageHeader title={t('title')} backHref="/admin/vendors" backLabel={tc('back')} />
        <p className="text-sm text-muted-foreground">{tc('loading')}</p>
      </>
    );
  }

  if (!detail.data) {
    return (
      <>
        <AdminPageHeader title={t('title')} backHref="/admin/vendors" backLabel={tc('back')} />
        <p className="text-sm text-muted-foreground">{tc('empty')}</p>
      </>
    );
  }

  const { vendor, supplies } = detail.data;
  const pending = supplies.filter((s) => s.status === 'PENDING');
  const history = supplies.filter((s) => s.status !== 'PENDING');

  return (
    <>
      <AdminPageHeader
        title={vendor.businessName}
        subtitle={`${vendor.name} · ${vendor.phone}`}
        backHref="/admin/vendors"
        backLabel={tc('back')}
      />

      <section className="mb-4 flex items-center justify-between gap-3 rounded-[var(--radius-2xl)] border border-border bg-card p-4">
        <div>
          <p className="text-xs text-muted-foreground">{t('balanceOwed')}</p>
          <p className="text-2xl font-bold tabular-nums">{formatPaise(paise(vendor.balancePaise))}</p>
        </div>
        <VendorLedgerControl vendorId={vendorId} />
      </section>

      {pending.length > 0 && (
        <section className="mb-4 rounded-[var(--radius-2xl)] border border-border bg-card p-4">
          <h2 className="mb-3 text-sm font-bold">{t('pendingSupplies')}</h2>
          <ul className="space-y-2">
            {pending.map((supply) => (
              <SupplyReviewRow
                key={supply.id}
                supply={supply}
                onConfirm={() => review.mutate({ supplyId: supply.id, action: 'confirm' })}
                onReject={(reason) => review.mutate({ supplyId: supply.id, action: 'reject', rejectionReason: reason })}
                pending={review.isPending}
              />
            ))}
          </ul>
        </section>
      )}

      <section className="rounded-[var(--radius-2xl)] border border-border bg-card p-4">
        <h2 className="mb-3 text-sm font-bold">{t('supplyHistory')}</h2>
        {history.length === 0 ? (
          <p className="text-sm text-muted-foreground">{tc('empty')}</p>
        ) : (
          <ul className="divide-y divide-border">
            {history.map((supply) => (
              <li key={supply.id} className="flex items-center justify-between gap-2 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {supply.productName} <span className="text-muted-foreground">({supply.variantLabel})</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {supply.quantity} × {formatPaise(paise(supply.costPricePaise))} ·{' '}
                    {format.dateTime(new Date(supply.createdAt), { day: 'numeric', month: 'short' })}
                  </p>
                  {supply.rejectionReason && (
                    <p className="mt-0.5 text-xs text-danger">{supply.rejectionReason}</p>
                  )}
                </div>
                <span
                  className={cn(
                    'shrink-0 rounded-full px-2.5 py-1 text-xs font-bold',
                    supply.status === 'CONFIRMED' ? 'bg-tint-green text-primary-dark' : 'bg-danger/10 text-danger',
                  )}
                >
                  {supply.status === 'CONFIRMED' ? t('confirmed') : t('rejected')}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function SupplyReviewRow({
  supply,
  onConfirm,
  onReject,
  pending,
}: {
  supply: SupplyRow;
  onConfirm: () => void;
  onReject: (reason: string) => void;
  pending: boolean;
}) {
  const t = useTranslations('admin.vendors');
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');

  return (
    <li className="rounded-[var(--radius)] border border-border p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">
            {supply.productName} <span className="text-muted-foreground">({supply.variantLabel})</span>
          </p>
          <p className="text-xs text-muted-foreground">
            {supply.quantity} × {formatPaise(paise(supply.costPricePaise))} ={' '}
            <span className="font-semibold">
              {formatPaise(paise((BigInt(supply.costPricePaise) * BigInt(supply.quantity)).toString()))}
            </span>
          </p>
        </div>
        {!rejecting && (
          <div className="flex shrink-0 gap-1.5">
            <button
              type="button"
              disabled={pending}
              onClick={onConfirm}
              className="h-8 rounded-[var(--radius)] bg-primary px-3 text-xs font-bold text-primary-foreground disabled:opacity-50"
            >
              {t('confirm')}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => setRejecting(true)}
              className="h-8 rounded-[var(--radius)] border border-danger px-3 text-xs font-bold text-danger disabled:opacity-50"
            >
              {t('reject')}
            </button>
          </div>
        )}
      </div>

      {rejecting && (
        <div className="mt-2 flex items-center gap-1.5">
          <input
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder={t('rejectionReasonPlaceholder')}
            className="h-8 min-w-0 flex-1 rounded border border-border bg-background px-2 text-xs outline-none"
          />
          <button
            type="button"
            disabled={pending || reason.trim().length < 3}
            onClick={() => onReject(reason.trim())}
            className="h-8 shrink-0 rounded-[var(--radius)] bg-danger px-3 text-xs font-bold text-white disabled:opacity-50"
          >
            {t('reject')}
          </button>
          <button
            type="button"
            onClick={() => setRejecting(false)}
            className="h-8 shrink-0 rounded-[var(--radius)] border border-border px-3 text-xs"
          >
            {t('cancel')}
          </button>
        </div>
      )}
    </li>
  );
}

interface LedgerAdjustResponse {
  entryId: string;
  balancePaise: string;
}

function VendorLedgerControl({ vendorId }: { vendorId: string }) {
  const t = useTranslations('admin.vendors');
  const tc = useTranslations('admin.common');
  const queryClient = useQueryClient();

  const [open, setOpen] = useState(false);
  const [direction, setDirection] = useState<'CREDIT' | 'DEBIT'>('DEBIT');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const adjust = useMutation({
    mutationFn: () =>
      api.post<LedgerAdjustResponse>(`/api/admin/vendors/${vendorId}/ledger`, {
        direction,
        amountPaise: Number(rupeesToPaise(amount)),
        reason: reason.trim(),
      }),
    onSuccess: () => {
      setError(null);
      setSuccess(true);
      setAmount('');
      setReason('');
      void queryClient.invalidateQueries({ queryKey: ['admin-vendor', vendorId] });
    },
    onError: (err) => {
      setSuccess(false);
      if (err instanceof ApiClientError) {
        if (err.code === 'FORBIDDEN') return setError(t('superAdminOnly'));
        if (err.code === 'BAD_REQUEST') return setError(t('adjustInvalidAmount'));
      }
      setError(tc('failed'));
    },
  });

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          setSuccess(false);
          setError(null);
        }}
        className="h-10 shrink-0 rounded-[var(--radius)] bg-primary px-4 text-xs font-bold text-primary-foreground"
      >
        {t('recordPayment')}
      </button>
    );
  }

  const amountPaise = amount.trim() ? rupeesToPaise(amount) : 0n;
  const canSubmit = amountPaise > 0n && reason.trim().length >= 5 && !adjust.isPending;

  return (
    <div className="w-full max-w-sm space-y-2.5 rounded-[var(--radius)] bg-secondary/40 p-3">
      <div className="grid grid-cols-2 gap-2">
        {(['DEBIT', 'CREDIT'] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setDirection(value)}
            aria-pressed={direction === value}
            className={cn(
              'h-9 rounded-[var(--radius)] border text-xs font-semibold',
              direction === value ? 'border-primary bg-tint-green text-primary-dark' : 'border-border',
            )}
          >
            {value === 'DEBIT' ? t('paidOut') : t('correction')}
          </button>
        ))}
      </div>

      <div>
        <label className="text-xs font-medium text-muted-foreground">{t('amount')}</label>
        <div className="mt-1 flex items-center gap-1.5 rounded-[var(--radius)] border border-border bg-background px-2.5">
          <span className="text-sm text-muted-foreground">₹</span>
          <input
            inputMode="decimal"
            value={amount}
            onChange={(event) => setAmount(event.target.value.replace(/[^\d.]/g, ''))}
            className="h-9 min-w-0 flex-1 bg-transparent text-sm outline-none"
          />
        </div>
      </div>

      <div>
        <label className="text-xs font-medium text-muted-foreground">{t('reason')}</label>
        <textarea
          value={reason}
          onChange={(event) => setReason(event.target.value.slice(0, 300))}
          placeholder={t('reasonPlaceholder')}
          rows={2}
          className="mt-1 w-full resize-none rounded-[var(--radius)] border border-border bg-background px-2.5 py-2 text-sm outline-none"
        />
      </div>

      {error && <p className="text-xs font-medium text-danger">{error}</p>}
      {success && <p className="text-xs font-medium text-primary">{t('adjustSuccess')}</p>}

      <div className="flex gap-2">
        <button
          type="button"
          disabled={!canSubmit}
          onClick={() => {
            setError(null);
            setSuccess(false);
            adjust.mutate();
          }}
          className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-[var(--radius)] bg-primary text-xs font-bold text-primary-foreground disabled:opacity-50"
        >
          {adjust.isPending && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
          {t('confirmPayment')}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="h-9 rounded-[var(--radius)] border border-border px-3 text-xs font-medium"
        >
          {tc('back')}
        </button>
      </div>
    </div>
  );
}
