import 'dotenv/config';
import { mkdirSync, writeFileSync } from 'node:fs';
import { db } from '../src/lib/db';

/**
 * Site-wide promotional pricing (session 2026-11-10, client request) — every
 * active variant's `pricePaise` drops to ~3% of its `mrpPaise`, clamped to
 * ₹1–3, so the storefront's existing `hasDiscount`/`% off` badge logic
 * (`product-card.tsx` — `mrp > price` and `Math.round((1 - price/mrp)*100)`)
 * shows a ~97% off badge automatically. `mrpPaise` itself is left untouched,
 * so the "real" price is still on record as the strikethrough reference.
 *
 * Writes a timestamped backup of every touched variant's *current*
 * `pricePaise` before changing anything — `revert-97-percent-offer.ts`
 * reads that file back to undo this exactly when the promo ends.
 * Deletes itself after running — one-off, not app code.
 */

const MIN_PAISE = 100; // ₹1
const MAX_PAISE = 300; // ₹3

async function main() {
  const variants = await db.productVariant.findMany({
    where: { isActive: true, product: { isActive: true } },
    select: { id: true, pricePaise: true, mrpPaise: true, product: { select: { sku: true } } },
  });

  mkdirSync('scripts/backups', { recursive: true });
  const backupPath = `scripts/backups/price-backup-${Date.now()}.json`;
  writeFileSync(
    backupPath,
    JSON.stringify(
      variants.map((v) => ({ id: v.id, sku: v.product.sku, pricePaise: v.pricePaise.toString() })),
      null,
      2,
    ),
  );
  console.log(`Backed up ${variants.length} variant prices to ${backupPath}`);

  let updated = 0;
  for (const v of variants) {
    const raw = Math.round(Number(v.mrpPaise) * 0.03);
    const clamped = Math.max(MIN_PAISE, Math.min(MAX_PAISE, raw));
    await db.productVariant.update({ where: { id: v.id }, data: { pricePaise: BigInt(clamped) } });
    updated++;
  }
  console.log(`Updated ${updated} variants to the ₹1–3 offer price range.`);
}

main()
  .catch((error) => {
    console.error('ERR', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
