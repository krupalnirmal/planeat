import { Apple, Cookie, Flame, Leaf, Milk, Wheat } from 'lucide-react';
import { Link } from '@/i18n/navigation';

/**
 * The "Shop by Category" row (session 2026-09-19, client reference mockup):
 * one real photo per tile on a colour-tinted card, a small solid-colour
 * icon badge overlaid on the photo, and a label underneath — replacing the
 * earlier plain-mint tile with a bare photo and a label underneath.
 * Colours reuse the exact 6-hue palette already validated for the admin
 * dashboard's stat tiles (`STAT_HUES` in `analytics-tab.tsx`) rather than
 * inventing a new one.
 *
 * Sized small on purpose (session 2026-09-20, client feedback: the first
 * cut only fit ~2 tiles before needing to scroll) — 3 full tiles plus a
 * peek of the 4th fit on a standard ~390px phone width before any
 * scrolling, so the slider reads as a row to browse, not a wall you have
 * to swipe through blind. The chevron from the first cut is dropped here:
 * with a card this narrow there's no room for it next to a 2-line label,
 * and the whole card is already the tap target.
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
      className="card-3d flex w-[104px] shrink-0 snap-start flex-col overflow-hidden rounded-[var(--radius)] transition-transform active:scale-[0.97]"
      style={{ backgroundColor: style.bg }}
    >
      <div className="relative grid h-[78px] w-full place-items-center overflow-hidden p-1.5">
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
        <span
          className="absolute top-1.5 left-1.5 grid size-5 shrink-0 place-items-center rounded-full text-white ring-2 ring-white/80"
          style={{ backgroundColor: style.icon }}
        >
          <Icon className="size-2.5" aria-hidden />
        </span>
      </div>
      <p className="line-clamp-2 px-1.5 pb-2 text-center text-[10.5px] leading-tight font-semibold">{name}</p>
    </Link>
  );
}
