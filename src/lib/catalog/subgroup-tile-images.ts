import subgroupMap from './subgroup-tile-cloudinary-map.json';

/**
 * Curated icon photos for the category rail's sub-group tabs (Leafy
 * Vegetables, Fruit Vegetables, ...), keyed by the sub-group id from
 * `VEGETABLE_TYPES`/`GROCERY_TYPES` — client-supplied (session 2026-08-25,
 * "icon - sidebar" folder), uploaded via `scripts/upload-client-icons.mjs`.
 * Same pattern as `CATEGORY_TILE_IMAGES`: a curated photo takes priority
 * over whichever product happens to be first in that sub-group, so the
 * rail doesn't depend on catalogue ordering. A sub-group with no curated
 * entry falls back to its first product's own photo (see callers).
 */
export const SUBGROUP_TILE_IMAGES: Record<string, string> = subgroupMap;
