import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/utils';

/**
 * PART 5 — the "Shop by Category" grid: a real 2×2 photo collage per
 * category with a "+N more" count overlaid on the images themselves, and a
 * plain title underneath. Matches the client's second reference (the
 * grouped-by-category rail): white card, no per-category theming, the photos
 * do the selling.
 */

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
  // nobody asked for.
  const subtitle = slug === 'vegetables' ? t('vegetablesSubtitle') : slug === 'fruits' ? t('fruitsSubtitle') : null;

  return (
    <Link
      href={`/category/${slug}`}
      className="flex flex-col overflow-hidden rounded-[var(--radius)] border border-border bg-card shadow-sm transition-transform active:scale-[0.98]"
    >
      <div className="relative aspect-[4/3] w-full bg-secondary">
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

      <div className="p-3">
        <p className="truncate text-[15px] leading-tight font-black">{name}</p>
        {subtitle && (
          <p className="truncate text-[11px] font-medium text-muted-foreground">{subtitle}</p>
        )}
      </div>
    </Link>
  );
}
