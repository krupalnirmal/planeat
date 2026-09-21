'use client';

import { ImageIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * Product detail's photo gallery. A single image still renders as the plain
 * static photo it always was; more than one gets the same
 * swipe-plus-dot-indicator pattern as the home banner carousel
 * (banner-carousel.tsx) so a shopper can flip through every angle the admin
 * uploaded (M9's multi-image support) instead of only ever seeing the first.
 *
 * Full-bleed square (session 2026-09-21, client reference) — was capped at
 * 240px, which read as a small product shot rather than the reference's
 * large hero photo. The dot indicators moved from a row below the image to
 * an overlay on the image itself (bottom-right, on a translucent pill),
 * matching the reference; `page.tsx` layers its own overlays (the
 * conditional Organic badge, the wishlist heart) on top of this same
 * `relative` image box from outside, since those are product-specific
 * concerns this gallery component doesn't own.
 */
export function ProductGallery({ images, alt }: { images: string[]; alt: string }) {
  const trackRef = useRef<HTMLUListElement>(null);
  const slideRefs = useRef<Array<HTMLLIElement | null>>([]);
  const [active, setActive] = useState(0);

  useEffect(() => {
    const track = trackRef.current;
    if (!track || images.length <= 1) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.find((entry) => entry.isIntersecting);
        if (!visible) return;
        const index = slideRefs.current.findIndex((el) => el === visible.target);
        if (index !== -1) setActive(index);
      },
      { root: track, threshold: 0.6 },
    );

    for (const slide of slideRefs.current) {
      if (slide) observer.observe(slide);
    }
    return () => observer.disconnect();
  }, [images.length]);

  function goTo(index: number) {
    slideRefs.current[index]?.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' });
  }

  if (images.length === 0) {
    return (
      <div className="grid aspect-square w-full place-items-center overflow-hidden rounded-[var(--radius-2xl)] bg-white">
        <ImageIcon className="size-16 text-muted-foreground/30" aria-hidden />
      </div>
    );
  }

  return (
    <div className="relative w-full">
      <ul
        ref={trackRef}
        className="flex aspect-square snap-x snap-mandatory overflow-x-auto scroll-smooth rounded-[var(--radius-2xl)] bg-white [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {images.map((url, index) => (
          <li
            key={url}
            ref={(el) => {
              slideRefs.current[index] = el;
            }}
            className="grid w-full shrink-0 snap-center snap-always place-items-center overflow-hidden"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt={alt} className="size-full object-cover" decoding="async" />
          </li>
        ))}
      </ul>

      {/* Overlaid on the photo's own bottom-right corner (session
          2026-09-21, client reference) — was a row of dots below the
          image. */}
      {images.length > 1 && (
        <div className="absolute right-3 bottom-3 flex h-5 items-center gap-1 rounded-full bg-foreground/40 px-2 backdrop-blur-sm">
          {images.map((url, index) => (
            <button
              key={url}
              type="button"
              aria-label={`${alt} ${index + 1}`}
              aria-current={index === active}
              onClick={() => goTo(index)}
              className="grid place-items-center p-0.5"
            >
              <span
                aria-hidden
                className={cn(
                  'block size-1.5 rounded-full transition-all',
                  index === active ? 'w-4 bg-white' : 'bg-white/60',
                )}
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
