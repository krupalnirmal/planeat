import { ChevronLeft } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/utils';

/**
 * The sticky header every non-home screen shares: a faint-yellow band
 * echoing the home header and the PWA status bar, a title, and an optional
 * back link. Consolidates what used to be six near-identical `<header>`
 * blocks (category, product, checkout, subscription…) and gives the tab-root
 * screens (wallet, profile, orders…) a header they never had — the gap that
 * made the app feel unfinished next to a reference like Blinkit, where every
 * screen carries the same chrome.
 */
export function PageHeader({
  title,
  subtitle,
  backHref,
  backLabel,
  trailing,
}: {
  title: string;
  subtitle?: string;
  backHref?: string;
  backLabel?: string;
  trailing?: ReactNode;
}) {
  return (
    <header className="sticky top-0 z-30 flex items-center gap-2 border-b border-border bg-accent-faint px-3 py-3">
      {backHref && (
        <Link
          href={backHref}
          aria-label={backLabel}
          className="grid size-11 shrink-0 place-items-center rounded-full"
        >
          <ChevronLeft className="size-5" aria-hidden />
        </Link>
      )}
      <div className="min-w-0 flex-1">
        <h1 className={cn('truncate font-bold', backHref ? 'text-base' : 'text-xl')}>{title}</h1>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </div>
      {trailing}
    </header>
  );
}

/**
 * A single-message screen (logged out, empty, not found) centred in the
 * space between the header and the bottom nav, instead of pinned to the top
 * with the rest of the screen sitting empty beneath it.
 */
export function CenteredState({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-[65dvh] flex-col items-center justify-center px-6 py-10 text-center">
      {children}
    </div>
  );
}
