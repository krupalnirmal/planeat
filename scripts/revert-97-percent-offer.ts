import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { db } from '../src/lib/db';

/**
 * Undoes `apply-97-percent-offer.ts` — restores every variant's
 * `pricePaise` from the backup file that script wrote before touching
 * anything. Usage: `npx tsx scripts/revert-97-percent-offer.ts
 * scripts/backups/price-backup-<timestamp>.json`.
 * Deletes itself after running — one-off, not app code.
 */

async function main() {
  const backupFile = process.argv[2];
  if (!backupFile) {
    throw new Error('Usage: npx tsx scripts/revert-97-percent-offer.ts <backup-file>');
  }

  const rows: { id: string; sku: string; pricePaise: string }[] = JSON.parse(
    readFileSync(backupFile, 'utf-8'),
  );

  let reverted = 0;
  for (const row of rows) {
    await db.productVariant.update({
      where: { id: row.id },
      data: { pricePaise: BigInt(row.pricePaise) },
    });
    reverted++;
  }
  console.log(`Reverted ${reverted} variant prices from ${backupFile}`);
}

main()
  .catch((error) => {
    console.error('ERR', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
