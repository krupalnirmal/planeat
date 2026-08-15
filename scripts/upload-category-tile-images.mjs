import 'dotenv/config';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';

/**
 * One-off upload for the hand-picked category-tile photos (client-supplied
 * stock, curated down from 24 to the ones with no visible watermark and a
 * clean, bright, catalogue-consistent look). The raw source photos live in
 * ../planeat-reference/sample_images, outside the repo — same reasoning as
 * the reference video/screenshots elsewhere in this project: staging
 * material for a one-time upload, not an app asset. Writes
 * src/lib/catalog/category-tile-cloudinary-map.json, which
 * category-tile-images.ts reads at build/runtime; re-run only if the
 * selection needs to change (the JSON map is what actually ships).
 */

const SRC_DIR = '../planeat-reference/sample_images';
const OUT = 'src/lib/catalog/category-tile-cloudinary-map.json';

const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
const apiKey = process.env.CLOUDINARY_API_KEY;
const apiSecret = process.env.CLOUDINARY_API_SECRET;

// slug (Cloudinary public_id) -> source file in public/sample_images
const SELECTED = {
  'vegetables-1': 'basket-full-vegetables_1112-316.avif',
  'vegetables-2': '360_F_218038263_jrMTjxavorAH0fjwrm6uMlV2B0Xnw4jV.jpg',
  'vegetables-3': 'background-with-big-fresh-cabbage-royalty-free-image-1701363221.avif',
  'vegetables-4': 'images (1).jfif',
  'fruits-1': 'assortment-of-fresh-fruits-isolated-on-white-background-free-photo.jpg',
  'fruits-2': 'fresh-citrus-fruits-splashing-water-with-leaves_84443-87268.avif',
  'fruits-3': 'images (3).jfif',
  'fruits-4': 'images (4).jfif',
  'dairy-1': 'images (11).jfif',
  'dairy-2': 'images (9).jfif',
  'dairy-3': 'images (7).jfif',
  'dairy-4': 'images (10).jfif',
  'grocery-1':
    'diverse-collection-healthy-pantry-staples-including-various-legumes-grains-seeds-nuts-like-lentils-rice-beans-high-453256971.webp',
  'grocery-2': 'images (13).jfif',
  'grocery-3': 'intro-1653421019.jpg',
};

function sha1Hex(input) {
  return crypto.createHash('sha1').update(input).digest('hex');
}

async function uploadOne(publicId, buffer) {
  const timestamp = Math.floor(Date.now() / 1000);
  const folder = 'planeat/category-tiles';

  const toSign = `folder=${folder}&public_id=${publicId}&timestamp=${timestamp}`;
  const signature = sha1Hex(`${toSign}${apiSecret}`);

  const form = new FormData();
  form.append('file', new Blob([buffer], { type: 'image/jpeg' }));
  form.append('api_key', apiKey);
  form.append('timestamp', String(timestamp));
  form.append('folder', folder);
  form.append('public_id', publicId);
  form.append('signature', signature);

  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`, {
    method: 'POST',
    body: form,
  });
  const json = await res.json();
  if (!res.ok || !json.secure_url) {
    throw new Error(`Upload failed for ${publicId}: ${json.error?.message ?? res.status}`);
  }
  return json.secure_url;
}

async function main() {
  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error('Missing CLOUDINARY_* env vars');
  }

  const map = {};
  for (const [publicId, file] of Object.entries(SELECTED)) {
    const inPath = path.join(SRC_DIR, file);
    // Collage tiles render at ~95x60px on a 390px phone — 500px wide source
    // is generous headroom without shipping the original 1-2MB stock file.
    const buffer = await sharp(inPath)
      .resize({ width: 500, withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();
    const url = await uploadOne(publicId, buffer);
    map[publicId] = url;
    console.log(`${publicId} -> ${url}`);
  }

  await mkdir(path.dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(map, null, 2) + '\n');
  console.log(`\nWrote ${Object.keys(map).length} entries to ${OUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
