import { ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from '@/i18n/navigation';

/**
 * One section of the home screen.
 *
 * No longer a white slab of its own (session 2026-08-26, client feedback:
 * home should carry the same tint the category pages already do behind
 * their white cards) — the page-level bg-tint-lime shows straight through,
 * and the individual pieces inside each section (category tiles, product
 * cards) are what carry their own white/card backgrounds now.
 *
 * The header lives inside the section, not above it, so the title visibly
 * belongs to the content under it.
 */
export function HomeSection({
  id,
  title,
  icon,
  seeAllHref,
  seeAllLabel,
  children,
}: {
  id: string;
  title: string;
  icon?: ReactNode;
  seeAllHref?: string;
  seeAllLabel?: string;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="px-4 py-4">
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
    </section>
  );
}
