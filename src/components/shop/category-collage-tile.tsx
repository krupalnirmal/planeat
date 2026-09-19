import { Apple, ChevronRight, Cookie, Flame, Leaf, Milk, Wheat } from 'lucide-react';
import { Link } from '@/i18n/navigation';

/**
 * The "Shop by Category" row (session 2026-09-19, client reference mockup):
 * one real photo per tile on a colour-tinted card, a small solid-colour
 * icon badge + label + chevron footer — replacing the earlier plain-mint
 * tile with a bare photo and a label underneath. Colours reuse the exact
 * 6-hue palette already validated for the admin dashboard's stat tiles
 * (`STAT_HUES` in `analytics-tab.tsx`) rather than inventing a new one.
 */

const CATEGORY_STYLE: Record<string, { bg: string; icon: string; Icon: typeof Leaf }> = {
  vegetables: { bg: '#E8F5EA', icon: '#2fa355', Icon: Leaf },
  fruits: { bg: '#FDF1DE', icon: '#c97a17', Icon: Apple },
  dairy: { bg: '#EAF2FE', icon: '#2a78d6', Icon: Milk },
  'bakery-biscuits': { bg: '#FCEEF3', icon: '#e87ba4', Icon: Cookie },
  aata: { bg: '#F1EEFC', icon: '#4a3aa7', Icon: Wheat },
  masala: { bg: '#FDEEE3', icon: '#eb6834', Icon: Flame },
};
const DEFAULT_STYLE = { bg: '#E8F5EA', icon: '#2fa355', Icon: Leaf };

export function CategoryCollageTile({
  slug,
  name,
  images,
}: {
  slug: string;
  name: string;
  images: string[];
}) {
  const style = CATEGORY_STYLE[slug] ?? DEFAULT_STYLE;
  const Icon = style.Icon;

  return (
    <Link
      href={`/category/${slug}`}
      className="card-3d flex w-[168px] shrink-0 snap-start flex-col overflow-hidden rounded-[var(--radius)] transition-transform active:scale-[0.97]"
      style={{ backgroundColor: style.bg }}
    >
      <div className="grid h-[120px] w-full place-items-center overflow-hidden p-3">
        {images[0] ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={images[0]}
            alt=""
            aria-hidden
            loading="lazy"
            className="size-full rounded-[calc(var(--radius)-4px)] object-cover"
          />
        ) : null}
      </div>
      <div className="flex items-center gap-1.5 px-2.5 pb-2.5">
        <span
          className="grid size-7 shrink-0 place-items-center rounded-full text-white"
          style={{ backgroundColor: style.icon }}
        >
          <Icon className="size-3.5" aria-hidden />
        </span>
        <p className="min-w-0 flex-1 truncate text-xs font-semibold">{name}</p>
        <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
      </div>
    </Link>
  );
}
