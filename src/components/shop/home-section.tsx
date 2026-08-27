import { ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/utils';

/**
 * One section of the home screen, on the page's near-white background.
 *
 * Two shapes, both straight out of the client's reference (session
 * 2026-08-27):
 *   - `card` — the whole section is one white rounded card (Categories).
 *   - default — the heading sits directly on the page background and the
 *     content's own items carry the white (Top Picks).
 */
export function HomeSection({
  id,
  title,
  icon,
  seeAllHref,
  seeAllLabel,
  card = false,
  children,
}: {
  id: string;
  title: string;
  icon?: ReactNode;
  seeAllHref?: string;
  seeAllLabel?: string;
  card?: boolean;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="px-4 py-3">
      <div className={cn(card && 'rounded-[var(--radius)] bg-card p-3 shadow-sm')}>
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 id={id} className="flex items-center gap-1.5 text-[17px] font-bold">
            {icon}
            {title}
          </h2>
          {seeAllHref && seeAllLabel && (
            <Link
              href={seeAllHref}
              className="flex shrink-0 items-center text-xs font-semibold text-primary"
            >
              {seeAllLabel}
              <ChevronRight className="size-3.5" aria-hidden />
            </Link>
          )}
        </div>
        {children}
      </div>
    </section>
  );
}
