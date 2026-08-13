// Temporary helper: how far has the seed got? Safe to delete.
import 'dotenv/config';
import { db } from '../src/lib/db';

async function main() {
  const [cats, products, withImages, variants, aliases, settings, users] = await Promise.all([
    db.category.count(),
    db.product.count(),
    db.product.count({ where: { NOT: { imageUrls: { equals: [] } } } }),
    db.productVariant.count(),
    db.productAlias.count(),
    db.appSetting.count(),
    db.user.count(),
  ]);
  console.log(JSON.stringify({ cats, products, withImages, variants, aliases, settings, users }));
}

main()
  .catch((error) => {
    console.error('ERR', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
