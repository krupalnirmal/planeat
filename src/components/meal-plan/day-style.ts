import { Apple, Carrot, Cherry, Citrus, Grape, Leaf, LeafyGreen, Sprout } from 'lucide-react';

/**
 * Per-day colour + icon (session 2026-09-23, client reference screenshots)
 * — shared between the day-list and weekly-summary screens so both use the
 * same seven-way palette rather than drifting apart. The reference pairs a
 * distinct food photo with each day (tomato/carrot/eggplant/…) — there's no
 * real meaning behind which food goes with which day, so rather than
 * fabricate seven new product photos for a purely decorative badge, each
 * day gets a real lucide food icon instead, still colour-varied the same
 * way (see `day-list-screen.tsx`'s own longer note on this).
 */
export const DAY_STYLE: Record<number, { bg: string; solid: string; icon: typeof Leaf }> = {
  1: { bg: '#E3F5E9', solid: '#2fa355', icon: Sprout },
  2: { bg: '#FDEEDB', solid: '#f2811d', icon: Carrot },
  3: { bg: '#F1EEFC', solid: '#7c5cd6', icon: Grape },
  4: { bg: '#FCEEF3', solid: '#e0518a', icon: Cherry },
  5: { bg: '#E3F6F5', solid: '#14919b', icon: LeafyGreen },
  6: { bg: '#FDF3DE', solid: '#d98c0a', icon: Citrus },
  7: { bg: '#EFEBFB', solid: '#6a4fc7', icon: Apple },
};
