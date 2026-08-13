import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/utils';

/**
 * PART 5 — the "Shop by Category" grid: a real 2×2 photo collage per
 * category with a "+N more" count overlaid on the images, and a title
 * underneath. Every tile is a fixed height regardless of image count or
 * whether it has a subtitle — letting content drive the height made rows
 * misalign against each other (a subtitled Vegetables tile taller than its
 * neighbour), which read as broken rather than just plain.
 */

const IMAGE_AREA_HEIGHT = 120;
const TILE_HEIGHT = 190;

// Fewer than 4 photos reads as a gap unless the grid itself adapts: 1 photo
// fills the whole cell, 2 sit side by side, 3 gives the first one double
// height so nothing looks like a missing tile.
function spanClass(index: number, total: number): string {
  if (total <= 1) return 'col-span-2 row-span-2';
  if (total === 2) return 'col-span-1 row-span-2';
  if (total === 3 && index === 0) return 'col-span-1 row-span-2';
  return 'col-span-1 row-span-1';
}

export function CategoryCollageTile({
  slug,
  name,
  images,
  moreCount,
}: {
  slug: string;
  name: string;
  images: string[];
  moreCount: number;
}) {
  const t = useTranslations('home');

  // Only the two categories the reference actually specifies get a written
  // subtitle; inventing marketing copy for the other four would be a claim
  // nobody asked for. The row still stays even because the tile height is
  // fixed, not because every card has one.
  const subtitle = slug === 'vegetables' ? t('vegetablesSubtitle') : slug === 'fruits' ? t('fruitsSubtitle') : null;

  return (
    <Link
      href={`/category/${slug}`}
      style={{ height: TILE_HEIGHT }}
      className="flex flex-col overflow-hidden rounded-[var(--radius)] border border-border bg-card shadow-sm transition-transform active:scale-[0.98]"
    >
      <div className="relative w-full shrink-0 bg-secondary" style={{ height: IMAGE_AREA_HEIGHT }}>
        {images.length > 0 && (
          <div className="grid size-full grid-cols-2 grid-rows-2 gap-0.5">
            {images.map((src, index) => (
              <div key={src} className={cn('overflow-hidden', spanClass(index, images.length))}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt="" aria-hidden loading="lazy" className="size-full object-cover" />
              </div>
            ))}
          </div>
        )}

        {moreCount > 0 && (
          <span className="absolute right-1.5 bottom-1.5 rounded-full bg-black/65 px-2 py-0.5 text-[11px] font-semibold text-white backdrop-blur-sm">
            {t('moreCount', { count: moreCount })}
          </span>
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col justify-center p-3">
        <p className="truncate text-[15px] leading-tight font-black">{name}</p>
        {subtitle && (
          <p className="truncate text-[11px] font-medium text-muted-foreground">{subtitle}</p>
        )}
      </div>
    </Link>
  );
}
