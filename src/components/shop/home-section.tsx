import { ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from '@/i18n/navigation';

/**
 * One full-bleed white panel on the home screen.
 *
 * The quick-commerce reference stacks its home screen as SLABS: each section
 * is a white band running edge to edge, separated by a thin strip of the
 * page colour showing through. That is what makes the page read as one
 * continuous document instead of a scatter of floating cards — the problem
 * the client flagged ("everything feels separate, the background feels
 * empty").
 *
 * The header lives inside the panel, not above it, so the title visibly
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
    <section aria-labelledby={id} className="bg-card px-4 py-4">
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
