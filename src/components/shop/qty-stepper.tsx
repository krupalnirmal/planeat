'use client';

import { Minus, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

/**
 * The ADD → stepper control from M2's product card.
 *
 * R10 — both buttons clear 44×44px. On a 390px screen with a thumb on a moving
 * bus, a 32px minus button is a mis-tap, and a mis-tap here silently changes
 * what the customer is charged.
 */
export function QtyStepper({
  quantity,
  onIncrement,
  onDecrement,
  disabled,
  max,
  className,
  label,
}: {
  quantity: number;
  onIncrement: () => void;
  onDecrement: () => void;
  disabled?: boolean;
  max?: number;
  className?: string;
  label?: string;
}) {
  const t = useTranslations('common');
  const atMax = max !== undefined && quantity >= max;

  return (
    <div
      className={cn(
        'flex h-11 items-center justify-between rounded-[var(--radius)] bg-primary text-primary-foreground',
        className,
      )}
    >
      <button
        type="button"
        onClick={onDecrement}
        disabled={disabled}
        aria-label={`${t('remove')}${label ? ` — ${label}` : ''}`}
        className="grid h-11 w-11 place-items-center rounded-l-[var(--radius)] disabled:opacity-50"
      >
        <Minus className="size-4" aria-hidden />
      </button>

      <span aria-live="polite" className="min-w-6 text-center text-sm font-bold tabular-nums">
        {quantity}
      </span>

      <button
        type="button"
        onClick={onIncrement}
        disabled={disabled || atMax}
        aria-label={`${t('add')}${label ? ` — ${label}` : ''}`}
        className="grid h-11 w-11 place-items-center rounded-r-[var(--radius)] disabled:opacity-50"
      >
        <Plus className="size-4" aria-hidden />
      </button>
    </div>
  );
}
