import 'dotenv/config';
import { db } from '../src/lib/db';

/**
 * Client's full "daily used vegetables" list (session 2026-11-01) expands
 * the Daily Use Vegetables rail tab beyond the 5 variant-only products
 * tagged session 2026-10-30. These 7 are existing, already-real vegetable
 * products that just need the same `daily-use` tag added:
 *   कोथिंबीर, कढीपत्ता, शिमला मिरची (अलियास of Capsicum), अद्रक (Ginger),
 *   लसूण (Garlic), कांदे (Onion), बीट (Beetroot).
 *
 * Not included here — flagged back to the client, not silently skipped:
 * - लिंबू (Lemon) is FRT-LEMON, filed under Fruits, not Vegetables — the
 *   rail's subgroup tabs are scoped per category (`getCategoryProducts`
 *   only ever queries one category), so tagging it `daily-use` would do
 *   nothing on the Vegetables page. Needs an explicit decision (duplicate
 *   listing vs. move category) before touching it.
 * - सलाद orange गाजर, मुळा, कांद्याची पात — still no product/photo exists
 *   for these (same gap noted session 2026-10-30's GF.zip batch).
 * Deletes itself after running — one-off, not app code.
 */

const SKUS = [
  'VEG-CORIANDER',
  'VEG-CURRYLEAVES',
  'VEG-CAPSICUM',
  'VEG-GINGER',
  'VEG-GARLIC',
  'VEG-ONION',
  'VEG-BEETROOT',
];

async function main() {
  // Same `sortOrder: -1` as the original 5 (session 2026-10-30) — without
  // it these would sort by their pre-existing `sortOrder: 0` + name and
  // could land past page 1, splitting the tab across pagination again.
  const result = await db.product.updateMany({
    where: { sku: { in: SKUS } },
    data: { vegetableType: 'daily-use', sortOrder: -1 },
  });
  console.log(`Tagged ${result.count} products as daily-use`);
}

main()
  .catch((error) => {
    console.error('ERR', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
