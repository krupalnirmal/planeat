import cloudinaryMap from './category-tile-cloudinary-map.json';

/**
 * The home page's category collage tiles used to show whichever product
 * photos happened to be first in each category — which meant a category
 * with weak product photography looked weak on the home page too, however
 * good the catalogue actually was. These are hand-picked, watermark-free
 * stock photos the client supplied specifically for this tile, uploaded via
 * `scripts/upload-category-tile-images.mjs` (the raw source photos live
 * outside the repo once uploaded — this JSON map of the resulting Cloudinary
 * URLs is the only artifact that needs to ship). The "+N more" badge still
 * comes from the real product count, so the tile doesn't overstate what's in
 * stock — only the four small preview photos are curated rather than live.
 */
const map = cloudinaryMap as Record<string, string>;

/**
 * Returns `undefined`, not `[]`, when a prefix has no curated photos —
 * callers reach for the category's own product photos with `??`, which an
 * empty array would sail straight past, leaving the tile blank.
 */
function imagesFor(prefix: string): string[] | undefined {
  const images = Object.keys(map)
    .filter((key) => key.startsWith(`${prefix}-`))
    .sort()
    .map((key) => map[key]);
  return images.length > 0 ? images : undefined;
}

export const CATEGORY_TILE_IMAGES: Record<string, string[] | undefined> = {
  vegetables: imagesFor('vegetables'),
  fruits: imagesFor('fruits'),
  dairy: imagesFor('dairy'),
  'bakery-biscuits': imagesFor('bakery'),
  // Aata/Masala (session 2026-09-19) — one curated hero photo each,
  // cropped from the client's own reference mockup rather than a product
  // photo, since the home tile now shows a single big image per category
  // (CategoryCollageTile only ever reads `images[0]`, same as every
  // category above).
  aata: imagesFor('aata'),
  masala: imagesFor('masala'),
};
