import 'dotenv/config';
import { db } from '../src/lib/db';

/**
 * Tags the 5 daily-use vegetable variant products (added session 2026-10-30)
 * into the Vegetables rail's `daily-use` subgroup, which replaced the
 * always-empty `organic` subgroup — see `src/lib/catalog/vegetable-types.ts`.
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
    data: { vegetableType: 'daily-use' },
  });
  console.log(`Tagged ${result.count} products as daily-use`);
}

main()
  .catch((error) => {
    console.error('ERR', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
