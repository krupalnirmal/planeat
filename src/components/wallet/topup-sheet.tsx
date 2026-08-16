'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useSession } from '@/hooks/use-session';
import { ApiClientError, api, qs } from '@/lib/api/client';
import { formatPaise, paise, rupeesToPaise } from '@/lib/money';
import { cn } from '@/lib/utils';
import { openGatewayCheckout } from './gateway-checkout';

/**
 * Wallet top-up (M7).
 *
 * The flow, and why it looks like this:
 *
 *   initiate → open the gateway → the widget closes → POLL our own status
 *
 * The poll is the important part. We never trust the widget's success callback
 * to mean money moved (P2); we wait for our server to tell us the webhook
 * landed. That also means closing the browser mid-payment is harmless — the
 * credit happens without anyone watching, and the balance is simply right the
 * next time the customer opens the app.
 */

type Phase = 'choose' | 'awaiting-gateway' | 'polling' | 'done' | 'failed';

interface InitiateResponse {
  paymentId: string;
  provider: string;
  gatewayOrderId: string;
  publicKey: string;
  amountPaise: string;
  currency: string;
  isMock: boolean;
}

interface StatusResponse {
  status: 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED';
  balancePaise: string;
}

const POLL_INTERVAL_MS = 2_000;
/** Two minutes. Past that, tell the truth: it may still land later. */
const POLL_ATTEMPTS = 60;

export function TopupSheet({
  presetsPaise,
  minimumPaise,
  onClose,
}: {
  presetsPaise: string[];
  minimumPaise: string;
  onClose: () => void;
}) {
  const t = useTranslations('wallet');
  const tc = useTranslations('common');
  const te = useTranslations('errors');
  const queryClient = useQueryClient();
  const { user } = useSession();

  const [phase, setPhase] = useState<Phase>('choose');
  const [selected, setSelected] = useState<string>(presetsPaise[1] ?? presetsPaise[0] ?? '50000');
  const [custom, setCustom] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [pendingPaymentId, setPendingPaymentId] = useState<string | null>(null);
  const [mockOrderId, setMockOrderId] = useState<string | null>(null);

  const amountPaise = custom.trim() ? rupeesToPaise(custom) : paise(selected);
  const minimum = paise(minimumPaise);

  function finish(status: StatusResponse['status'], balancePaise: string) {
    void queryClient.invalidateQueries({ queryKey: ['wallet'] });
    void queryClient.invalidateQueries({ queryKey: ['wallet-transactions'] });

    if (status === 'PAID') {
      setPhase('done');
      setMessage(t('topupSuccess', { amount: formatPaise(paise(balancePaise)) }));
    } else if (status === 'FAILED') {
      setPhase('failed');
      setMessage(t('topupFailed'));
    } else {
      // Still pending after the poll window. Do not claim failure — the
      // webhook may well land in a minute, and telling someone their payment
      // failed when it did not is the worst possible answer here.
      setPhase('done');
      setMessage(t('topupPending'));
    }
  }

  async function pollUntilSettled(paymentId: string) {
    setPhase('polling');

    for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));

      try {
        const status = await api.get<StatusResponse>(
          `/api/wallet/topup/status${qs({ paymentId })}`,
        );
        if (status.status !== 'PENDING') {
          finish(status.status, status.balancePaise);
          return;
        }
      } catch {
        // A dropped poll is not a failed payment; keep watching.
      }
    }

    finish('PENDING', '0');
  }

  const initiate = useMutation({
    mutationFn: () =>
      api.post<InitiateResponse>('/api/wallet/topup/initiate', {
        amountPaise: Number(amountPaise),
      }),
    onSuccess: async (data) => {
      setPendingPaymentId(data.paymentId);

      // With PAYMENT_PROVIDER=mock there is no gateway to open. The customer
      // gets an explicit simulate button instead, which drives the real
      // webhook handler (R2 — the whole app runs on mocks).
      if (data.isMock) {
        setMockOrderId(data.gatewayOrderId);
        setPhase('awaiting-gateway');
        return;
      }

      try {
        await openGatewayCheckout({
          gatewayOrderId: data.gatewayOrderId,
          publicKey: data.publicKey,
          amountPaise: data.amountPaise,
          currency: data.currency,
          appName: 'Get Fresh',
          description: t('addMoney'),
          prefill: { name: user?.name ?? undefined, contact: user?.phone },
          onSuccess: () => void pollUntilSettled(data.paymentId),
          onDismiss: () => setPhase('choose'),
          onFailure: (text) => {
            setPhase('failed');
            setMessage(text);
          },
        });
        setPhase('awaiting-gateway');
      } catch (error) {
        setPhase('failed');
        setMessage(error instanceof Error ? error.message : te('generic'));
      }
    },
    onError: (error) => {
      setPhase('failed');
      setMessage(
        error instanceof ApiClientError && error.code === 'BAD_REQUEST'
          ? t('minimumTopup', { amount: formatPaise(minimum, { hidePaise: true }) })
          : te('generic'),
      );
    },
  });

  const simulate = useMutation({
    mutationFn: () =>
      api.post('/api/dev/simulate-payment', { gatewayOrderId: mockOrderId, outcome: 'captured' }),
    onSuccess: () => {
      if (pendingPaymentId) void pollUntilSettled(pendingPaymentId);
    },
    onError: () => {
      setPhase('failed');
      setMessage(te('generic'));
    },
  });

  const belowMinimum = amountPaise < minimum;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40">
      <div className="w-full max-w-[480px] rounded-t-[calc(var(--radius)*1.6)] bg-background p-5 pb-8">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-bold">{t('addMoney')}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={tc('close')}
            className="grid size-11 place-items-center rounded-full"
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>

        {phase === 'choose' && (
          <>
            <p className="mb-2 text-sm font-medium text-muted-foreground">{t('chooseAmount')}</p>
            <div className="grid grid-cols-3 gap-2">
              {presetsPaise.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => {
                    setSelected(preset);
                    setCustom('');
                  }}
                  aria-pressed={!custom && selected === preset}
                  className={cn(
                    'min-h-12 rounded-[var(--radius)] border text-sm font-semibold',
                    !custom && selected === preset
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-card',
                  )}
                >
                  {formatPaise(paise(preset), { hidePaise: true })}
                </button>
              ))}
            </div>

            <label htmlFor="custom-amount" className="mt-4 block text-sm font-medium">
              {t('customAmount')}
            </label>
            <div className="mt-1.5 flex items-center gap-2 rounded-[var(--radius)] border border-border bg-card px-3">
              <span className="text-sm text-muted-foreground">₹</span>
              <input
                id="custom-amount"
                inputMode="decimal"
                value={custom}
                onChange={(event) => setCustom(event.target.value.replace(/[^\d.]/g, ''))}
                className="h-12 min-w-0 flex-1 bg-transparent text-base outline-none"
              />
            </div>

            {belowMinimum && (
              <p className="mt-2 text-xs text-warning">
                {t('minimumTopup', { amount: formatPaise(minimum, { hidePaise: true }) })}
              </p>
            )}

            <button
              type="button"
              onClick={() => {
                setMessage(null);
                initiate.mutate();
              }}
              disabled={belowMinimum || initiate.isPending}
              className="mt-5 flex h-11 w-full items-center justify-center gap-2 rounded-[var(--radius)] bg-primary text-sm font-bold text-primary-foreground disabled:opacity-50"
            >
              {initiate.isPending && <Loader2 className="size-4 animate-spin" aria-hidden />}
              {t('payNow')} · {formatPaise(amountPaise, { hidePaise: true })}
            </button>
          </>
        )}

        {phase === 'awaiting-gateway' && (
          <div className="py-6 text-center">
            <Loader2 className="mx-auto size-8 animate-spin text-primary" aria-hidden />
            <p className="mt-3 text-sm font-medium">{t('processing')}</p>
            <p className="mt-1 text-xs text-muted-foreground">{t('processingHint')}</p>

            {mockOrderId && (
              <button
                type="button"
                onClick={() => simulate.mutate()}
                disabled={simulate.isPending}
                className="mt-6 h-12 w-full rounded-[var(--radius)] border border-dashed border-primary text-sm font-semibold text-primary disabled:opacity-50"
              >
                {t('simulatePayment')}
              </button>
            )}
          </div>
        )}

        {phase === 'polling' && (
          <div className="py-8 text-center">
            <Loader2 className="mx-auto size-8 animate-spin text-primary" aria-hidden />
            <p className="mt-3 text-sm font-medium">{t('processing')}</p>
            <p className="mt-1 text-xs text-muted-foreground">{t('processingHint')}</p>
          </div>
        )}

        {(phase === 'done' || phase === 'failed') && (
          <div className="py-6 text-center">
            <p
              className={cn(
                'text-sm font-semibold',
                phase === 'done' ? 'text-success' : 'text-danger',
              )}
            >
              {message}
            </p>
            <button
              type="button"
              onClick={onClose}
              className="mt-6 h-11 w-full rounded-[var(--radius)] bg-primary text-sm font-bold text-primary-foreground"
            >
              {tc('done')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
