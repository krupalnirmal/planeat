/**
 * Per-day colour + photo (session 2026-09-23, client reference screenshots;
 * restyled again session 2026-10-29, client reference — a full-card tint
 * plus a real food photo badge instead of a small plain icon, and the tint
 * now applies to every day regardless of whether it has items yet, not just
 * the ones with picks). Used by the weekly-summary screen's day tiles.
 *
 * The photos are cropped directly out of the client's own reference
 * screenshot with sharp (circular, transparent background) — same approach
 * as `upload-meal-plan-home-images.mjs` — not substituted stock, so they
 * match the reference exactly (see `scripts/upload-day-tile-images.mjs`).
 */
export const DAY_STYLE: Record<number, { bg: string; solid: string; photo: string }> = {
  1: {
    bg: '#E3F5E9',
    solid: '#2fa355',
    photo: 'https://res.cloudinary.com/kf9nvvpv/image/upload/v1793263818/planeat/meal-plan-home/day-tile-mon.png',
  },
  2: {
    bg: '#FDEEDB',
    solid: '#c3690f',
    photo: 'https://res.cloudinary.com/kf9nvvpv/image/upload/v1793263821/planeat/meal-plan-home/day-tile-tue.png',
  },
  3: {
    bg: '#F1EEFC',
    solid: '#7c5cd6',
    photo: 'https://res.cloudinary.com/kf9nvvpv/image/upload/v1793263824/planeat/meal-plan-home/day-tile-wed.png',
  },
  4: {
    bg: '#FCEEF3',
    solid: '#c23468',
    photo: 'https://res.cloudinary.com/kf9nvvpv/image/upload/v1793263829/planeat/meal-plan-home/day-tile-thu.png',
  },
  5: {
    bg: '#E3F6F5',
    solid: '#14919b',
    photo: 'https://res.cloudinary.com/kf9nvvpv/image/upload/v1793263832/planeat/meal-plan-home/day-tile-fri.png',
  },
  6: {
    bg: '#FDF3DE',
    solid: '#b5750a',
    photo: 'https://res.cloudinary.com/kf9nvvpv/image/upload/v1793263835/planeat/meal-plan-home/day-tile-sat.png',
  },
  7: {
    bg: '#FCEEF3',
    solid: '#b5365f',
    photo: 'https://res.cloudinary.com/kf9nvvpv/image/upload/v1793263837/planeat/meal-plan-home/day-tile-sun.png',
  },
};
