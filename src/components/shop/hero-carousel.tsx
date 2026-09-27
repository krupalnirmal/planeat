'use client';

import { useEffect, useState } from 'react';
import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/utils';

/**
 * Auto-rotating hero banner (session 2026-09-28, owner request — "only one
 * image shows, I want multiple, auto-carousel every 3 sec"). Slides to the
 * next one every `INTERVAL_MS`; a tap on a dot jumps straight there and
 * resets the timer, same as any standard carousel.
 *
 * Each slide's own art already has its headline/CTA copy baked in (see
 * `HeroBanner`'s own doc comment in `page.tsx`) — this component only
 * handles the rotation and the real navigation `Link`s layered transparently
 * over each slide's baked-in button(s).
 */

export interface HeroSlide {
  key: string;
  alt: string;
  /** Set together for a slide with separate mobile/desktop art (only the
      original launch slide has this); otherwise use `src` for one image at
      every width. */
  mobileSrc?: string;
  desktopSrc?: string;
  src?: string;
  /** One link covering the whole slide — for art with a single baked-in
      message and no separate per-button hit-boxes to match. */
  href?: string;
  ariaLabel?: string;
  /** Precise per-button hit-boxes instead, for art with more than one
      baked-in CTA (percentage-based, positioned over the button(s) in that
      slide's own art specifically). */
  overlays?: Array<{ href: string; ariaLabel: string; className: string }>;
}

const INTERVAL_MS = 3_000;

export function HeroCarousel({ slides }: { slides: HeroSlide[] }) {
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (slides.length <= 1) return;
    const timer = setInterval(() => {
      setActive((i) => (i + 1) % slides.length);
    }, INTERVAL_MS);
    return () => clearInterval(timer);
    // Re-arm whenever a dot tap changes `active` out of turn, so the next
    // auto-advance is always a full interval away from whatever the
    // customer just did, not whenever the original timer happened to fire.
  }, [active, slides.length]);

  return (
    <div className="relative overflow-hidden rounded-[var(--radius-xl)] border border-primary/10">
      <div
        className="flex transition-transform duration-700 ease-out"
        style={{ transform: `translateX(-${active * 100}%)` }}
      >
        {slides.map((slide, index) => (
          <div key={slide.key} className="relative w-full shrink-0">
            {slide.mobileSrc && slide.desktopSrc ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={slide.mobileSrc}
                  alt={slide.alt}
                  className="block w-full sm:hidden"
                  loading={index === 0 ? undefined : 'lazy'}
                />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={slide.desktopSrc}
                  alt={slide.alt}
                  className="hidden w-full sm:block"
                  loading={index === 0 ? undefined : 'lazy'}
                />
              </>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={slide.src}
                alt={slide.alt}
                className="block w-full"
                loading={index === 0 ? undefined : 'lazy'}
              />
            )}

            {/* Only the active slide's own links should ever be tappable —
                otherwise a slide waiting off-screen mid-transition could
                still catch a tap meant for what's actually visible. */}
            {index === active && slide.href && (
              <Link href={slide.href} aria-label={slide.ariaLabel} className="absolute inset-0" />
            )}
            {index === active &&
              slide.overlays?.map((overlay) => (
                <Link
                  key={overlay.href + overlay.ariaLabel}
                  href={overlay.href}
                  aria-label={overlay.ariaLabel}
                  className={cn('absolute', overlay.className)}
                />
              ))}
          </div>
        ))}
      </div>

      {slides.length > 1 && (
        // A dark pill behind the dots (session 2026-09-28) rather than bare
        // dots on the image — this banner's own art varies between pale
        // cream and busy photo backgrounds slide to slide, and a plain
        // light/dark dot pair disappeared against whichever one didn't
        // contrast with it.
        <div className="absolute bottom-1.5 left-1/2 flex -translate-x-1/2 gap-0.5 rounded-full bg-black/25 px-1 backdrop-blur-sm">
          {slides.map((slide, index) => (
            // `min-h-0` (session 2026-09-28) deliberately opts out of the
            // global `button { min-height: 44px }` touch-target rule
            // (R10) — a compact pagination dot row is the one case that
            // rule doesn't fit: a 44px-tall button here would blow the
            // whole indicator up into a tall grey block instead of a thin
            // row (a real bug the owner caught). `p-2` still keeps a real
            // ~20px tap area around the small visible dot itself, rather
            // than shrinking the actual hit-box down to the dot's own
            // couple of pixels.
            <button
              key={slide.key}
              type="button"
              onClick={() => setActive(index)}
              aria-label={slide.alt}
              aria-current={index === active}
              className="min-h-0 p-2"
            >
              <span
                className={cn(
                  'block h-1 rounded-full transition-all',
                  index === active ? 'w-3 bg-white' : 'w-1 bg-white/50',
                )}
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
