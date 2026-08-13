import {
  Apple,
  ArrowRight,
  Cake,
  Carrot,
  IceCream,
  Milk,
  ShoppingBasket,
  type LucideIcon,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';

/**
 * PART 5 — the "Shop by Category" grid: a tinted card per category with real
 * product photos, a small icon badge, a title + subtitle, and a circular
 * arrow button — matching the client's own Planeat reference exactly (its
 * Vegetables and Fruits cards).
 *
 * The data (`collages` on `HomePayload`) was built in Phase 0/1 for exactly
 * this and simply had no consumer yet — `getHomePayload` already returns up
 * to 4 image URLs and the remaining count per category in one query, so this
 * component is pure presentation.
 */

const STYLE: Record<
  string,
  { icon: LucideIcon; badgeBg: string; badgeFg: string; cardBg: string; arrowBg: string }
> = {
  vegetables: {
    icon: Carrot,
    badgeBg: 'bg-primary/15',
    badgeFg: 'text-primary-dark',
    cardBg: 'bg-tint-green',
    arrowBg: 'bg-primary-dark',
  },
  fruits: {
    icon: Apple,
    badgeBg: 'bg-[#F5A62333]',
    badgeFg: 'text-[#C97A17]',
    cardBg: 'bg-tint-yellow',
    arrowBg: 'bg-[#C97A17]',
  },
  dairy: {
    icon: Milk,
    badgeBg: 'bg-[#2C5C8F26]',
    badgeFg: 'text-[#2C5C8F]',
    cardBg: 'bg-[#E8EFF7]',
    arrowBg: 'bg-[#2C5C8F]',
  },
  'bakery-biscuits': {
    icon: Cake,
    badgeBg: 'bg-[#8A5A2B26]',
    badgeFg: 'text-[#8A5A2B]',
    cardBg: 'bg-[#F6EBDD]',
    arrowBg: 'bg-[#8A5A2B]',
  },
  'ice-cream': {
    icon: IceCream,
    badgeBg: 'bg-[#A8365C26]',
    badgeFg: 'text-[#A8365C]',
    cardBg: 'bg-[#FBE7EE]',
    arrowBg: 'bg-[#A8365C]',
  },
  grocery: {
    icon: ShoppingBasket,
    badgeBg: 'bg-[#5C6B6226]',
    badgeFg: 'text-[#5C6B62]',
    cardBg: 'bg-[#EEF0E4]',
    arrowBg: 'bg-[#5C6B62]',
  },
};

const DEFAULT_STYLE = {
  icon: ShoppingBasket,
  badgeBg: 'bg-secondary',
  badgeFg: 'text-muted-foreground',
  cardBg: 'bg-secondary',
  arrowBg: 'bg-foreground',
};

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
  const style = STYLE[slug] ?? DEFAULT_STYLE;
  const Icon = style.icon;

  // Only the two categories the reference actually specifies get a written
  // subtitle; inventing marketing copy for the other four would be a claim
  // nobody asked for.
  const subtitle = slug === 'vegetables' ? t('vegetablesSubtitle') : slug === 'fruits' ? t('fruitsSubtitle') : null;

  return (
    <Link
      href={`/category/${slug}`}
      className={`relative flex h-[168px] flex-col overflow-hidden rounded-[var(--radius)] p-3 transition-transform active:scale-[0.98] ${style.cardBg}`}
    >
      <span
        className={`grid size-8 shrink-0 place-items-center rounded-full ${style.badgeBg} ${style.badgeFg}`}
      >
        <Icon className="size-4" aria-hidden />
      </span>

      {/* One real photo rather than a grid of disconnected thumbnails — the
          reference's own cards read as a single staged arrangement, and a
          2×2 of separate squares reads as a UI pattern instead. */}
      {images.length > 0 && (
        <div className="mt-2 flex-1 overflow-hidden rounded-xl shadow-sm">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={images[0]}
            alt=""
            aria-hidden
            loading="lazy"
            className="size-full object-cover"
          />
        </div>
      )}

      <div className="mt-2 flex items-end justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[15px] leading-tight font-black">{name}</p>
          {subtitle && (
            <p className="truncate text-[11px] font-medium text-muted-foreground">{subtitle}</p>
          )}
          {!subtitle && moreCount > 0 && (
            <p className="truncate text-[11px] font-medium text-muted-foreground">
              {t('moreCount', { count: moreCount })}
            </p>
          )}
        </div>
        <span
          className={`grid size-8 shrink-0 place-items-center rounded-full text-white ${style.arrowBg}`}
        >
          <ArrowRight className="size-4" aria-hidden />
        </span>
      </div>
    </Link>
  );
}
