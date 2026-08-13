'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

export interface CarouselBanner {
  id: string;
  imageUrl: string;
  title: string;
  linkUrl: string | null;
}

/**
 * The home banner carousel: swipeable, auto-advancing, with a dot indicator
 * — the standard pattern every quick-commerce app uses for its promotional
 * strip, not the plain scroll-and-forget-it list this replaces.
 *
 * Each slide's own natural aspect ratio decides its height (`ImageBanner`'s
 * `h-auto`, kept from the crop fix) — a finished marketing creative gets
 * shown whole, never cropped to fit a fixed box.
 */
export function BannerCarousel({ banners }: { banners: CarouselBanner[] }) {
  const trackRef = useRef<HTMLUListElement>(null);
  const slideRefs = useRef<Array<HTMLLIElement | null>>([]);
  const [active, setActive] = useState(0);

  // Tracks which slide is actually centred in view — driven by the user's
  // own swipe via IntersectionObserver, so manual scrolling and the dots
  // never disagree about which slide is "current".
  useEffect(() => {
    const track = trackRef.current;
    if (!track || banners.length <= 1) return;

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
  }, [banners.length]);

  // Auto-advance every 4.5s. Paused implicitly whenever the tab is not
  // visible (setInterval throttles in background tabs) — nothing fancier is
  // needed for a home-screen promo strip.
  useEffect(() => {
    if (banners.length <= 1) return;
    const timer = setInterval(() => {
      const next = (active + 1) % banners.length;
      slideRefs.current[next]?.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' });
    }, 4500);
    return () => clearInterval(timer);
  }, [active, banners.length]);

  function goTo(index: number) {
    slideRefs.current[index]?.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' });
  }

  // The 44px dot row carries its own breathing room, so the wrapper needs
  // less bottom margin than the plain-banner fallback does.
  return (
    <div className="mb-3">
      <ul
        ref={trackRef}
        className="flex snap-x snap-mandatory overflow-x-auto scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {banners.map((banner, index) => (
          <li
            key={banner.id}
            ref={(el) => {
              slideRefs.current[index] = el;
            }}
            className="w-full shrink-0 snap-center snap-always"
          >
            {banner.linkUrl ? (
              <a href={banner.linkUrl}>
                <ImageBanner imageUrl={banner.imageUrl} title={banner.title} />
              </a>
            ) : (
              <ImageBanner imageUrl={banner.imageUrl} title={banner.title} />
            )}
          </li>
        ))}
      </ul>

      {banners.length > 1 && (
        <div className="flex items-center justify-center gap-1">
          {banners.map((banner, index) => (
            // The BUTTON is the 44px tap target R10 requires (enforced
            // globally in `globals.css`); the visible dot is the small span
            // inside it. Styling the button itself as the dot is what made
            // these render as giant 44px-tall bars.
            <button
              key={banner.id}
              type="button"
              aria-label={banner.title}
              aria-current={index === active}
              onClick={() => goTo(index)}
              className="grid place-items-center px-1.5"
            >
              <span
                aria-hidden
                className={cn(
                  'block h-1.5 rounded-full transition-all',
                  index === active ? 'w-5 bg-primary' : 'w-1.5 bg-border',
                )}
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ImageBanner({ imageUrl, title }: { imageUrl: string; title: string }) {
  return (
    <div className="overflow-hidden rounded-[var(--radius)] bg-tint-green shadow-sm">
      {/* `h-auto`, not `object-cover`: a finished marketing creative with a
          logo and copy baked into the pixels gets shown whole, at its own
          aspect ratio, never cropped to fill a fixed box. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={imageUrl} alt={title} className="block h-auto w-full" />
    </div>
  );
}
