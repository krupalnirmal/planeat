// One-off: seeds the marketing banner the client supplied
// (public/banners/banner_3.jpg, resized and compressed from their original
// PNG). Idempotent on imageUrl, like the rest of the seed data (D-22 in
// spirit), so re-running this is harmless.
//
// Any banner NOT in this list is deactivated rather than deleted — a banner
// row can be referenced by analytics or an audit trail later, and
// `isActive: false` is how the admin panel retires one anyway.
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { db } from '../src/lib/db';
import { ID_PREFIX, newId } from '../src/lib/ids';

// slug -> Cloudinary URL, written by `scripts/upload-banners.mjs`.
const cloudinaryMap: Record<string, string> = (() => {
  try {
    return JSON.parse(readFileSync('public/banners/cloudinary-map.json', 'utf-8'));
  } catch {
    return {};
  }
})();

const url = (slug: string, localFile: string) => cloudinaryMap[slug] ?? localFile;

const BANNERS = [
  {
    imageUrl: url('banner_3', '/banners/banner_3.jpg'),
    titleMr: 'ताज्या भाज्या, ताजं आरोग्य!',
    titleHi: 'ताज़ी सब्ज़ियां, ताज़ी सेहत!',
    titleEn: 'Fresh vegetables, fresh health!',
    sortOrder: 0,
  },
];

async function main(): Promise<void> {
  const keep = BANNERS.map((banner) => banner.imageUrl);

  for (const banner of BANNERS) {
    const existing = await db.banner.findFirst({ where: { imageUrl: banner.imageUrl } });
    if (existing) {
      await db.banner.update({ where: { id: existing.id }, data: { ...banner, isActive: true } });
    } else {
      await db.banner.create({ data: { id: newId(ID_PREFIX.banner), ...banner } });
    }
  }

  const retired = await db.banner.updateMany({
    where: { imageUrl: { notIn: keep }, isActive: true },
    data: { isActive: false },
  });

  console.info(`Seeded ${BANNERS.length} banner(s); retired ${retired.count}.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
