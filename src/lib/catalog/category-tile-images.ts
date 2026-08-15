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

function imagesFor(prefix: string): string[] {
  return Object.keys(map)
    .filter((key) => key.startsWith(`${prefix}-`))
    .sort()
    .map((key) => map[key]);
}

export const CATEGORY_TILE_IMAGES: Record<string, string[]> = {
  vegetables: imagesFor('vegetables'),
  fruits: imagesFor('fruits'),
  dairy: imagesFor('dairy'),
  grocery: imagesFor('grocery'),
};
