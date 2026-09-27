import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import { CATEGORY_DEFAULT_STYLE, CATEGORY_STYLE } from './category-collage-tile';

/**
 * Horizontal category switcher on a category page itself (session 2026-09-27,
 * owner request) — a shopper landing on Vegetables shouldn't have to tap
 * back to the home screen just to jump to Fruits or Dairy. Same per-category
 * icon/colour as the home page's `CategoryCollageTile` (`CATEGORY_STYLE`),
 * just a plain icon circle instead of a photo collage — there's no room for
 * a photo card here without pushing the actual product grid below the fold.
 */
export function CategoryStrip({
  categories,
  activeSlug,
}: {
  categories: Array<{ id: string; slug: string; name: string }>;
  activeSlug: string;
}) {
  return (
    <ul className="flex gap-2 overflow-x-auto bg-card px-4 py-3 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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
                'flex w-[68px] flex-col items-center gap-1 rounded-[var(--radius)] border-2 p-1.5 text-center',
                active ? 'border-primary bg-tint-green' : 'border-transparent',
              )}
            >
              <span
                className="grid size-11 shrink-0 place-items-center rounded-full"
                style={{ backgroundColor: style.bg }}
                aria-hidden
              >
                <Icon className="size-5" style={{ color: style.icon }} aria-hidden />
              </span>
              <span
                className={cn(
                  'line-clamp-1 text-[11px] leading-tight',
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
