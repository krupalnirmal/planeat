'use client';

import { ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * "Product Details" / "Nutrition Facts" (session 2026-09-21, client
 * reference) — both used to be always-open sections; the reference shows
 * them collapsed by default, title + one-line preview + chevron, expanding
 * to the real content on tap. Local `useState`, no new dependency.
 */
export function ProductInfoAccordion({
  icon: Icon,
  title,
  preview,
  children,
}: {
  icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
  title: string;
  /** Shown under the title only while collapsed — hidden once expanded,
      since the real content below already says more than this preview. */
  preview: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border-b border-border py-3 last:border-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-start gap-2.5 text-left"
      >
        <Icon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="flex items-center justify-between gap-2">
            <span className="text-sm font-semibold">{title}</span>
            <ChevronDown
              className={cn('size-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')}
              aria-hidden
            />
          </span>
          {!open && <span className="mt-0.5 line-clamp-1 block text-xs text-muted-foreground">{preview}</span>}
        </span>
      </button>
      {open && <div className="mt-2 pl-[26px]">{children}</div>}
    </div>
  );
}
