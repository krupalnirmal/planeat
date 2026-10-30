import 'dotenv/config';
import { db } from '../src/lib/db';

/**
 * The 5 daily-use vegetable products (session 2026-10-30) all shipped with
 * the default `sortOrder: 0`, same as most of the catalogue — so the
 * category page's plain `[sortOrder asc, nameEn asc]` order scattered them
 * across pagination pages (`PER_PAGE = 24` in the category page). The
 * "Daily Use Vegetables" rail tab groups whatever's on the *current* page,
 * so "White Salad Cucumber" (alphabetically last of the 5) fell onto page 2
 * and the tab showed only 4 of 5 (client report, same session). Everything
 * else in the catalogue sits at the default `sortOrder: 0`, so a shared
 * *negative* sortOrder is what actually guarantees these 5 sort ahead of
 * the rest onto page 1 — a positive number would do the opposite and push
 * them toward the end.
 * Deletes itself after running — one-off, not app code.
 */

const SKUS = [
  'VEG-REDCARROT',
  'VEG-THICKGREENCHILLI',
  'VEG-THINGREENCHILLI',
  'VEG-WHITESALADCUCUMBER',
  'VEG-GREENCUCUMBER',
];

async function main() {
  const result = await db.product.updateMany({
    where: { sku: { in: SKUS } },
    data: { sortOrder: -1 },
  });
  console.log(`Set sortOrder=-1 on ${result.count} daily-use products`);
}

main()
  .catch((error) => {
    console.error('ERR', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
