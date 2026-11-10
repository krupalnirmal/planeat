import 'dotenv/config';
import { mkdirSync, writeFileSync } from 'node:fs';
import { db } from '../src/lib/db';

/**
 * Client narrowed the earlier site-wide 97% off promo (session 2026-11-10)
 * down to just 2 "hero" products per category, not the whole catalogue —
 * the full-catalogue version was already reverted via
 * `revert-97-percent-offer.ts` before this runs. Picks the first 2 active
 * products per category (by the storefront's own default order —
 * `sortOrder asc, nameEn asc`, the same ordering `getCategoryProducts` uses)
 * so the discounted items are whatever a customer already sees first in
 * that category, not an arbitrary pick.
 *
 * Same ₹1–3 clamp / backup-before-write pattern as the site-wide script —
 * `revert-97-percent-offer.ts` works on this backup file too.
 * Deletes itself after running — one-off, not app code.
 */

const MIN_PAISE = 100; // ₹1
const MAX_PAISE = 300; // ₹3
const PER_CATEGORY = 2;

async function main() {
  const categories = await db.category.findMany({
    where: { isActive: true },
    select: { id: true, slug: true, nameEn: true },
    orderBy: [{ sortOrder: 'asc' }],
  });

  const backupRows: { id: string; sku: string; pricePaise: string }[] = [];
  const chosen: { category: string; sku: string; nameEn: string }[] = [];

  for (const category of categories) {
    const products = await db.product.findMany({
      where: { categoryId: category.id, isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { nameEn: 'asc' }],
      take: PER_CATEGORY,
      select: {
        sku: true,
        nameEn: true,
        variants: { where: { isActive: true }, select: { id: true, pricePaise: true, mrpPaise: true } },
      },
    });

    for (const product of products) {
      chosen.push({ category: category.slug, sku: product.sku, nameEn: product.nameEn });
      for (const variant of product.variants) {
        backupRows.push({ id: variant.id, sku: product.sku, pricePaise: variant.pricePaise.toString() });
        const raw = Math.round(Number(variant.mrpPaise) * 0.03);
        const clamped = Math.max(MIN_PAISE, Math.min(MAX_PAISE, raw));
        await db.productVariant.update({ where: { id: variant.id }, data: { pricePaise: BigInt(clamped) } });
      }
    }
  }

  mkdirSync('scripts/backups', { recursive: true });
  const backupPath = `scripts/backups/price-backup-limited-${Date.now()}.json`;
  writeFileSync(backupPath, JSON.stringify(backupRows, null, 2));

  console.log(`Backed up ${backupRows.length} variant prices to ${backupPath}`);
  console.log(`Discounted ${chosen.length} products across ${categories.length} categories:`);
  for (const c of chosen) console.log(`  [${c.category}] ${c.sku} - ${c.nameEn}`);
}

main()
  .catch((error) => {
    console.error('ERR', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
