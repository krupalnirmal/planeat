import 'dotenv/config';
import { db } from '../src/lib/db.ts';

/**
 * Diagnostic: lists every active product with no photo (imageUrls empty or
 * its first entry blank), grouped by category, plus any category itself
 * missing its own iconUrl. Run against whichever DATABASE_URL is in .env —
 * on the Contabo VPS that's production, so this is meant to be run there via
 * SSH (`npx tsx scripts/find-missing-product-images.mjs`) to find exactly
 * what an admin needs to upload a photo for.
 */

const categories = await db.category.findMany({
  where: { isActive: true },
  select: {
    slug: true,
    nameEn: true,
    iconUrl: true,
    products: {
      where: { isActive: true },
      select: { sku: true, nameEn: true, imageUrls: true, isMealPlanEligible: true },
      orderBy: { nameEn: 'asc' },
    },
  },
  orderBy: { sortOrder: 'asc' },
});

let totalMissing = 0;

for (const category of categories) {
  const missing = category.products.filter((p) => {
    const urls = Array.isArray(p.imageUrls) ? p.imageUrls : [];
    return urls.length === 0 || !urls[0];
  });

  if (!category.iconUrl || missing.length > 0) {
    console.log(`\n${category.nameEn} (${category.slug})`);
    if (!category.iconUrl) console.log('  - category itself has no icon photo');
    for (const p of missing) {
      totalMissing++;
      console.log(`  - ${p.sku}  ${p.nameEn}${p.isMealPlanEligible ? '  [meal-plan]' : ''}`);
    }
  }
}

console.log(`\n${totalMissing} product(s) missing a photo.`);
process.exit(0);
