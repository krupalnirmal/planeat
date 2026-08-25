import 'dotenv/config';
import { writeFile, readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';

/**
 * One-off upload for the client's own hand-picked icon photos (session
 * 2026-08-25, "icon - sidebar" folder on their desktop) — replaces the
 * Vegetables/Fruits home-tile photo and seeds new curated sub-group rail
 * icons, the same pattern as upload-category-tile-images.mjs.
 */

const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
const apiKey = process.env.CLOUDINARY_API_KEY;
const apiSecret = process.env.CLOUDINARY_API_SECRET;

const SRC_DIR = 'C:/Users/Krupal/Desktop/icon - sidebar';

// public_id -> source file. Home-tile ids overwrite the existing curated
// entry in category-tile-cloudinary-map.json; subgroup-tiles/* are new,
// written to subgroup-tile-cloudinary-map.json.
const CATEGORY_TILE_UPDATES = {
  'vegetables-1': '1.jfif', // basket of mixed produce -> Vegetables home tile
  'fruits-1': '3.jfif', // banana/apple/orange -> Fruits home tile
};

const SUBGROUP_TILE_UPDATES = {
  leafy: '4.jfif', // coriander bunch -> Leafy Vegetables rail icon
  fruit: '2.jfif', // zucchini/tomato/ginger -> Fruit Vegetables rail icon
};

function sha1Hex(input) {
  return crypto.createHash('sha1').update(input).digest('hex');
}

async function uploadOne(publicId, folder, buffer) {
  const timestamp = Math.floor(Date.now() / 1000);
  const toSign = `folder=${folder}&public_id=${publicId}&timestamp=${timestamp}`;
  const signature = sha1Hex(`${toSign}${apiSecret}`);

  const form = new FormData();
  form.append('file', new Blob([buffer], { type: 'image/png' }));
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

async function loadJson(file) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch {
    return {};
  }
}

async function main() {
  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error('Missing CLOUDINARY_* env vars');
  }

  const categoryMapPath = 'src/lib/catalog/category-tile-cloudinary-map.json';
  const subgroupMapPath = 'src/lib/catalog/subgroup-tile-cloudinary-map.json';

  const categoryMap = await loadJson(categoryMapPath);
  const subgroupMap = await loadJson(subgroupMapPath);

  // PNG, not JPEG: these source photos are transparent-background cutouts
  // (the ".jfif" wrapper is really a PNG with alpha) — JPEG has no alpha
  // channel, so it silently flattened the transparent area to solid
  // black. Keeping PNG lets the tile's own tinted background show through
  // the cutout, which is the actual look being matched.
  for (const [publicId, file] of Object.entries(CATEGORY_TILE_UPDATES)) {
    const buffer = await sharp(path.join(SRC_DIR, file))
      .resize({ width: 500, withoutEnlargement: true })
      .png({ quality: 80 })
      .toBuffer();
    const url = await uploadOne(publicId, 'planeat/category-tiles', buffer);
    categoryMap[publicId] = url;
    console.log(`category-tiles/${publicId} -> ${url}`);
  }

  for (const [publicId, file] of Object.entries(SUBGROUP_TILE_UPDATES)) {
    const buffer = await sharp(path.join(SRC_DIR, file))
      .resize({ width: 200, withoutEnlargement: true })
      .png({ quality: 80 })
      .toBuffer();
    const url = await uploadOne(publicId, 'planeat/subgroup-tiles', buffer);
    subgroupMap[publicId] = url;
    console.log(`subgroup-tiles/${publicId} -> ${url}`);
  }

  await mkdir(path.dirname(categoryMapPath), { recursive: true });
  await writeFile(categoryMapPath, JSON.stringify(categoryMap, null, 2) + '\n');
  await writeFile(subgroupMapPath, JSON.stringify(subgroupMap, null, 2) + '\n');
  console.log(`\nWrote ${categoryMapPath} and ${subgroupMapPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
