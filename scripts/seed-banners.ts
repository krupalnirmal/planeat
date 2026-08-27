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

// Three client-supplied creatives (session 2026-08-27), replacing the
// single banner_3 that ran before. The home carousel rotates them; the
// titles below are the alt text, so they describe each creative's own
// headline rather than repeating one generic line three times.
const BANNERS = [
  {
    imageUrl: url('banner-1', '/banners/banner-1.jpg'),
    titleMr: 'ताजं खा, निरोगी राहा — निवडक ताजेपणा, तुमच्यासाठी',
    titleHi: 'ताज़ा खाएँ, स्वस्थ रहें — चुनी हुई ताज़गी, आपके लिए',
    titleEn: 'Eat Fresh, Live Fresh — handpicked freshness, just for you',
    sortOrder: 0,
  },
  {
    imageUrl: url('banner-2', '/banners/banner-2.jpg'),
    titleMr: 'चांगलं अन्न, चांगला मूड — रोजच्या गरजा, दारापर्यंत',
    titleHi: 'अच्छा खाना, अच्छा मूड — रोज़ की ज़रूरतें, आपके दरवाज़े तक',
    titleEn: 'Good Food. Good Mood. — daily essentials, at your doorstep',
    sortOrder: 1,
  },
  {
    imageUrl: url('banner-3', '/banners/banner-3.jpg'),
    titleMr: 'ताज्या भाज्या, ताजं आरोग्य!',
    titleHi: 'ताज़ी सब्ज़ियां, ताज़ी सेहत!',
    titleEn: 'Fresh vegetables, fresh health!',
    sortOrder: 2,
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
