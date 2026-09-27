import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import { CATEGORY_DEFAULT_STYLE, CATEGORY_STYLE } from './category-collage-tile';

/**
 * Horizontal category switcher on a category page itself (session 2026-09-27,
 * owner request) — a shopper landing on Vegetables shouldn't have to tap
 * back to the home screen just to jump to Fruits or Dairy. Same real photo +
 * colour-badge treatment as the home page's `CategoryCollageTile` (owner
 * feedback: the first cut's flat icon-only circle "looked too simple"), just
 * circular and smaller — there's no room for a full photo card here without
 * pushing the actual product grid below the fold.
 */
export function CategoryStrip({
  categories,
  activeSlug,
}: {
  categories: Array<{ id: string; slug: string; name: string; imageUrl: string | null }>;
  activeSlug: string;
}) {
  return (
    <ul className="flex gap-2 overflow-x-auto bg-card px-4 py-2.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {categories.map((category) => {
        const active = category.slug === activeSlug;
        const style = CATEGORY_STYLE[category.slug] ?? CATEGORY_DEFAULT_STYLE;
        const Icon = style.Icon;
        return (
          <li key={category.id} className="shrink-0">
            <Link
              href={`/category/${category.slug}`}
              aria-current={active}
              className={cn(
                'flex w-14 flex-col items-center gap-1 rounded-[var(--radius)] border-2 p-1 text-center',
                active ? 'border-primary bg-tint-green' : 'border-transparent',
              )}
            >
              <span
                className="relative grid size-9 shrink-0 place-items-center overflow-hidden rounded-full"
                style={{ backgroundColor: style.bg }}
              >
                {category.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={category.imageUrl}
                    alt=""
                    aria-hidden
                    loading="lazy"
                    className="size-full object-cover"
                  />
                ) : (
                  <Icon className="size-4" style={{ color: style.icon }} aria-hidden />
                )}
                <span
                  className="absolute top-0 left-0 grid size-3.5 shrink-0 place-items-center rounded-full text-white ring-1 ring-white/80"
                  style={{ backgroundColor: style.icon }}
                  aria-hidden
                >
                  <Icon className="size-2" aria-hidden />
                </span>
              </span>
              <span
                className={cn(
                  'line-clamp-1 text-[10px] leading-tight',
                  active ? 'font-bold text-foreground' : 'font-medium text-foreground',
                )}
              >
                {category.name}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
