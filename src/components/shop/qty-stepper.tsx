'use client';

import { Minus, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

/**
 * The ADD → stepper control from M2's product card.
 *
 * R10 — both buttons clear 44×44px by default. On a 390px screen with a
 * thumb on a moving bus, a 32px minus button is a mis-tap, and a mis-tap
 * here silently changes what the customer is charged. `size="sm"` is the
 * one deliberate exception (session 2026-09-01): the narrow product-card
 * rails (Order Again, Top Picks) are ~132-168px wide, and a 44px-per-button
 * stepper left almost no room for the price beside it, squeezing the MRP
 * strikethrough down to a sliver. 32px still clears WCAG's own 24px floor —
 * this app's 44px is its own stricter convention, not a hard requirement.
 */
export function QtyStepper({
  quantity,
  onIncrement,
  onDecrement,
  disabled,
  max,
  className,
  label,
  size = 'default',
}: {
  quantity: number;
  onIncrement: () => void;
  onDecrement: () => void;
  disabled?: boolean;
  max?: number;
  className?: string;
  label?: string;
  size?: 'default' | 'sm';
}) {
  const t = useTranslations('common');
  const atMax = max !== undefined && quantity >= max;
  const sm = size === 'sm';

  return (
    <div
      className={cn(
        'flex items-center rounded-[var(--radius)] bg-primary text-primary-foreground',
        // `sm` is intentionally sized to content (`w-fit`), not stretched —
        // the previous attempt passed `w-full` from the caller, which made
        // this stretch to fill the card's remaining space instead of
        // shrinking to its own content, so it kept crowding the price no
        // matter how small the buttons got. The default size keeps no
        // width of its own, same as before this change — every existing
        // caller (cart-screen, variant-picker, variant-picker-sheet)
        // already sets its own explicit width via `className`.
        sm ? 'h-7 w-fit' : 'h-11 justify-between',
        className,
      )}
    >
      <button
        type="button"
        onClick={onDecrement}
        disabled={disabled}
        aria-label={`${t('remove')}${label ? ` — ${label}` : ''}`}
        className={cn(
          'grid shrink-0 place-items-center rounded-l-[var(--radius)] disabled:opacity-50',
          // `min-h-0` is load-bearing: the app's global rule (R10,
          // globals.css) sets `min-height: 44px` on every <button>, and
          // `min-height` always wins over a smaller `height` regardless of
          // Tailwind's layer order — that's a different-property clash, not
          // a same-property cascade the layer order can resolve.
          sm ? 'h-7 w-7 min-h-0' : 'h-11 w-11',
        )}
      >
        <Minus className={sm ? 'size-3' : 'size-4'} aria-hidden />
      </button>

      <span
        aria-live="polite"
        className={cn(
          'shrink-0 text-center font-bold tabular-nums',
          // No fixed width here for `sm` (was `w-4`, a flat 16px regardless
          // of the digit) — just enough side padding to keep the number
          // off the buttons' rounded corners, so a 1-digit quantity doesn't
          // carry the same reserved width as a would-be 2-digit one.
          sm ? 'px-0.5 text-[11px]' : 'min-w-6 text-sm',
        )}
      >
        {quantity}
      </span>

      <button
        type="button"
        onClick={onIncrement}
        disabled={disabled || atMax}
        aria-label={`${t('add')}${label ? ` — ${label}` : ''}`}
        className={cn(
          'grid shrink-0 place-items-center rounded-r-[var(--radius)] disabled:opacity-50',
          sm ? 'h-7 w-7 min-h-0' : 'h-11 w-11',
        )}
      >
        <Plus className={sm ? 'size-3' : 'size-4'} aria-hidden />
      </button>
    </div>
  );
}
