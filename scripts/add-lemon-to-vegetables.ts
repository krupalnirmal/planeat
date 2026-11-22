import 'dotenv/config';
import { addAlias, createProduct, upsertVariant } from '../src/lib/admin/catalogue';
import { db } from '../src/lib/db';
import { UnitType } from '../src/generated/prisma/enums';

/**
 * Client decision (session 2026-11-22): Lemon should show in the Vegetables
 * page's Daily Use Vegetables tab too, not just under Fruits (FRT-LEMON) —
 * the rail is scoped per category, so a second, Vegetables-side product is
 * the only way to do that without moving FRT-LEMON itself (which stays
 * exactly as-is for anyone browsing Fruits). Same name/price/image/unit as
 * FRT-LEMON (prisma/seed.ts), new SKU.
 * Deletes itself after running — one-off, not app code.
 */

const IMAGE = 'https://res.cloudinary.com/kf9nvvpv/image/upload/v1787916994/planeat/products/frt-lemon.jpg';

async function main() {
  const actor = await db.user.findFirst({
    where: { role: { in: ['STORE_ADMIN', 'SUPER_ADMIN'] } },
    select: { id: true },
  });
  if (!actor) throw new Error('No admin/super-admin user found to attribute this write to');

  const category = await db.category.findFirst({
    where: { slug: 'vegetables' },
    select: { id: true },
  });
  if (!category) throw new Error('Vegetables category not found');

  const created = await createProduct(
    {
      sku: 'VEG-LEMON',
      nameEn: 'Lemon',
      nameMr: 'लिंबू',
      nameHi: 'नींबू',
      categoryId: category.id,
      unitType: UnitType.PIECE,
      tags: ['vitamin-c', 'garnish'],
      imageUrls: [IMAGE],
      isMealPlanEligible: true,
      isActive: true,
    },
    actor.id,
    null,
  );

  if (!created.ok) {
    console.log(`SKIP VEG-LEMON: ${created.reason}`);
    return;
  }

  await upsertVariant(
    created.productId,
    null,
    {
      label: '4 नग',
      quantity: 4,
      unit: UnitType.PIECE,
      pricePaise: 2000n,
      mrpPaise: 2400n,
      stockQty: 40,
      lowStockThreshold: 5,
      isDefault: true,
      isActive: true,
    },
    actor.id,
    null,
  );

  for (const alias of ['limbu', 'nimbu', 'lemon', 'लिंबू', 'नींबू']) {
    await addAlias(created.productId, alias, 'mr', actor.id, null);
  }

  await db.product.update({
    where: { id: created.productId },
    data: { vegetableType: 'daily-use', sortOrder: -1 },
  });

  console.log(`OK VEG-LEMON -> ${created.productId}`);
}

main()
  .catch((error) => {
    console.error('ERR', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
