import { Link } from '@/i18n/navigation';

/**
 * The "Shop by Category" grid, Blinkit-matched (session 2026-08-25): one
 * clean product photo per tile on a light mint tint, plain label
 * underneath — not a 2x2 photo collage with a "+N more" badge. Blinkit
 * fits four of these across a 390px screen, so the tile is small and the
 * label is the primary identifier, the photo a supporting glance.
 */

export function CategoryCollageTile({
  slug,
  name,
  images,
}: {
  slug: string;
  name: string;
  images: string[];
}) {
  return (
    <Link
      href={`/category/${slug}`}
      className="flex flex-col items-center gap-1.5 transition-transform active:scale-[0.96]"
    >
      <div className="grid aspect-square w-full place-items-center overflow-hidden rounded-[var(--radius)] bg-tint-green p-2">
        {images[0] ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={images[0]}
            alt=""
            aria-hidden
            loading="lazy"
            className="size-full rounded-[calc(var(--radius)-6px)] object-cover"
          />
        ) : null}
      </div>
      <p className="line-clamp-2 text-center text-[11px] leading-tight font-semibold">{name}</p>
    </Link>
  );
}
