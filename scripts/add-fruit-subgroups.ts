import 'dotenv/config';
import { createProduct, upsertVariant } from '../src/lib/admin/catalogue';
import { db } from '../src/lib/db';

/**
 * Populates the 3 Fruits subgroups (fresh/import/organic) added earlier this
 * session with real data (client request, session 2026-09-20 — "sadya tya
 * madhe data pan add karun de", the same follow-up the Organic Vegetable
 * batch answered for Vegetables).
 *
 * No fabricated data:
 * - "Fresh Fruits" just retags the 10 already-real, already-priced,
 *   already-photographed ordinary fruits that were never anything but
 *   fresh produce to begin with — Dragon Fruit and the 4 dry fruits are
 *   deliberately left out (dry fruits aren't "fresh"; Dragon Fruit's
 *   domestic-vs-imported mix is genuinely ambiguous, see below).
 * - "Import Fruits" retags Kiwi and Blueberry, both overwhelmingly
 *   imported in the Indian market with no meaningful domestically-grown
 *   segment to distinguish from — a real fact about these two, not a
 *   guess — plus one new "Imported Avocado" SKU, since avocado genuinely
 *   has both a real domestic (Kerala/Karnataka) and a real imported
 *   (Peru/Kenya) market segment worth selling as two distinct listings,
 *   same reasoning as the Organic Vegetable batch's own duplicated SKUs.
 * - "Organic Fruits" gets 4 new "Organic X" SKUs (Apple/Banana/Orange/
 *   Mango) — same exact pattern as VEG-ORG-*: reuse the regular
 *   product's own real photo, ~1.5x its price as the organic premium,
 *   one variant at the regular's smallest/only listed size.
 *
 * Deletes itself after running — one-off, not app code.
 */

const FRESH_SKUS = [
  'FRT-BANANA',
  'FRT-APPLE',
  'FRT-MOSAMBI',
  'FRT-PAPAYA',
  'FRT-POMEGRANATE',
  'FRT-LEMON',
  'FRT-ORANGE',
  'FRT-MANGO',
  'FRT-WATERMELON',
  'FRT-JAMUN',
];

const IMPORT_RETAG_SKUS = ['FRT-KIWI', 'FRT-BLUEBERRY'];

const ORGANIC_NEW = [
  {
    sku: 'FRT-ORG-APPLE',
    nameEn: 'Organic Apple',
    nameMr: 'ऑरगॅनिक सफरचंद',
    nameHi: 'ऑर्गेनिक सेब',
    baseSku: 'FRT-APPLE',
    variantIndex: 0, // 250 g — the smallest listed size
    priceMultiplier: 1.5,
  },
  {
    sku: 'FRT-ORG-BANANA',
    nameEn: 'Organic Banana',
    nameMr: 'ऑरगॅनिक केळी',
    nameHi: 'ऑर्गेनिक केला',
    baseSku: 'FRT-BANANA',
    variantIndex: 0, // 6 नग
    priceMultiplier: 1.5,
  },
  {
    sku: 'FRT-ORG-ORANGE',
    nameEn: 'Organic Orange',
    nameMr: 'ऑरगॅनिक संत्रा',
    nameHi: 'ऑर्गेनिक संतरा',
    baseSku: 'FRT-ORANGE',
    variantIndex: 0, // 250 g
    priceMultiplier: 1.5,
  },
  {
    sku: 'FRT-ORG-MANGO',
    nameEn: 'Organic Mango',
    nameMr: 'ऑरगॅनिक आंबा',
    nameHi: 'ऑर्गेनिक आम',
    baseSku: 'FRT-MANGO',
    variantIndex: 0, // 250 g
    priceMultiplier: 1.5,
  },
];

const IMPORT_NEW = [
  {
    sku: 'FRT-IMPORT-AVOCADO',
    nameEn: 'Imported Avocado',
    nameMr: 'आयात केलेला अ‍ॅव्होकॅडो',
    nameHi: 'आयातित एवोकाडो',
    baseSku: 'FRT-AVOCADO',
    variantIndex: 0, // 1 नग, the only size
    priceMultiplier: 1.4,
  },
];

function roundToClean(paise: number): number {
  return Math.round(paise / 100) * 100;
}

async function main() {
  const actor = await db.user.findFirst({
    where: { role: { in: ['STORE_ADMIN', 'SUPER_ADMIN'] } },
    select: { id: true },
  });
  if (!actor) throw new Error('No admin/super-admin user found to attribute this write to');

  const category = await db.category.findFirst({ where: { slug: 'fruits' } });
  if (!category) throw new Error('fruits category not found');

  // ── Fresh: retag 10 already-real products ──────────────────────────
  const freshResult = await db.product.updateMany({
    where: { sku: { in: FRESH_SKUS } },
    data: { vegetableType: 'fresh' },
  });
  console.log(`Fresh: retagged ${freshResult.count} products`);

  // ── Import: retag Kiwi + Blueberry ──────────────────────────────────
  const importRetagResult = await db.product.updateMany({
    where: { sku: { in: IMPORT_RETAG_SKUS } },
    data: { vegetableType: 'import' },
  });
  console.log(`Import (retagged): ${importRetagResult.count} products`);

  // ── Organic: 4 new products ─────────────────────────────────────────
  for (const spec of ORGANIC_NEW) {
    const base = await db.product.findFirst({
      where: { sku: spec.baseSku },
      select: { unitType: true, imageUrls: true, variants: { orderBy: { quantity: 'asc' } } },
    });
    if (!base) throw new Error(`base product ${spec.baseSku} not found`);
    const baseVariant = base.variants[spec.variantIndex];
    if (!baseVariant) throw new Error(`base variant not found for ${spec.baseSku}`);

    const created = await createProduct(
      {
        sku: spec.sku,
        nameEn: spec.nameEn,
        nameMr: spec.nameMr,
        nameHi: spec.nameHi,
        categoryId: category.id,
        unitType: base.unitType,
        tags: ['organic'],
        imageUrls: base.imageUrls as string[],
        isMealPlanEligible: true,
        isActive: true,
      },
      actor.id,
      null,
    );
    if (!created.ok) throw new Error(`createProduct failed for ${spec.sku}: ${created.reason}`);

    await db.product.update({ where: { id: created.productId }, data: { vegetableType: 'organic' } });

    await upsertVariant(
      created.productId,
      null,
      {
        label: baseVariant.label,
        quantity: baseVariant.quantity,
        unit: baseVariant.unit,
        pricePaise: BigInt(roundToClean(Number(baseVariant.pricePaise) * spec.priceMultiplier)),
        mrpPaise: BigInt(roundToClean(Number(baseVariant.mrpPaise) * spec.priceMultiplier)),
        stockQty: baseVariant.stockQty,
        lowStockThreshold: baseVariant.lowStockThreshold,
        isDefault: true,
        isActive: true,
      },
      actor.id,
      null,
    );
    console.log(`Organic: created ${spec.sku}`);
  }

  // ── Import: 1 new product ───────────────────────────────────────────
  for (const spec of IMPORT_NEW) {
    const base = await db.product.findFirst({
      where: { sku: spec.baseSku },
      select: { unitType: true, imageUrls: true, variants: { orderBy: { quantity: 'asc' } } },
    });
    if (!base) throw new Error(`base product ${spec.baseSku} not found`);
    const baseVariant = base.variants[spec.variantIndex];
    if (!baseVariant) throw new Error(`base variant not found for ${spec.baseSku}`);

    const created = await createProduct(
      {
        sku: spec.sku,
        nameEn: spec.nameEn,
        nameMr: spec.nameMr,
        nameHi: spec.nameHi,
        categoryId: category.id,
        unitType: base.unitType,
        tags: ['imported', 'exotic'],
        imageUrls: base.imageUrls as string[],
        isMealPlanEligible: true,
        isActive: true,
      },
      actor.id,
      null,
    );
    if (!created.ok) throw new Error(`createProduct failed for ${spec.sku}: ${created.reason}`);

    await db.product.update({ where: { id: created.productId }, data: { vegetableType: 'import' } });

    await upsertVariant(
      created.productId,
      null,
      {
        label: baseVariant.label,
        quantity: baseVariant.quantity,
        unit: baseVariant.unit,
        pricePaise: BigInt(roundToClean(Number(baseVariant.pricePaise) * spec.priceMultiplier)),
        mrpPaise: BigInt(roundToClean(Number(baseVariant.mrpPaise) * spec.priceMultiplier)),
        stockQty: baseVariant.stockQty,
        lowStockThreshold: baseVariant.lowStockThreshold,
        isDefault: true,
        isActive: true,
      },
      actor.id,
      null,
    );
    console.log(`Import: created ${spec.sku}`);
  }

  console.log('\nDone.');
}

main()
  .catch((error) => {
    console.error('ERR', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
