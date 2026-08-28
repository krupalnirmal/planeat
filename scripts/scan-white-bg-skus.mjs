/**
 * Scans every product photo in public/products/*.jpg and records which ones
 * are NOT on a clean white/studio background, using the same border-whiteness
 * measurement as fetch-white-bg-images.mjs.
 *
 * Client request (session 2026-08-28): the home page's "Top Picks for You"
 * rail should only ever show products whose photo is white-background — some
 * SKUs intentionally keep a rustic/wooden-board photo elsewhere in the app
 * (client's own choice for the category grid), but that same photo should
 * never surface in Top Picks. Rather than measuring pixels on every request,
 * this script writes a static exclude-list that the home query filters on.
 *
 * Run with: node scripts/scan-white-bg-skus.mjs
 * Re-run whenever a product photo changes.
 */

import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const DIR = 'public/products';
const OUT = 'src/lib/catalog/non-white-bg-skus.json';

const MIN_LUM = 215;
const MAX_SAT = 28;

async function borderWhiteness(buffer) {
  const { data, info } = await sharp(buffer)
    .resize(120, 120, { fit: 'cover' })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width: w, height: h, channels: c } = info;
  const band = Math.max(1, Math.round(w * 0.1));
  let n = 0, sumLum = 0, sumSat = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!(x < band || x >= w - band || y < band || y >= h - band)) continue;
      const i = (y * w + x) * c;
      const max = Math.max(data[i], data[i + 1], data[i + 2]);
      const min = Math.min(data[i], data[i + 1], data[i + 2]);
      sumLum += (max + min) / 2;
      sumSat += max - min;
      n++;
    }
  }
  return { lum: sumLum / n, sat: sumSat / n };
}

async function main() {
  const files = (await readdir(DIR)).filter((f) => f.endsWith('.jpg'));
  const nonWhite = [];

  for (const file of files) {
    const sku = path.basename(file, '.jpg');
    const buffer = await readFile(path.join(DIR, file));
    const { lum, sat } = await borderWhiteness(buffer);
    if (lum < MIN_LUM || sat > MAX_SAT) {
      nonWhite.push(sku);
      console.log(`${sku.padEnd(22)} NOT white (lum ${Math.round(lum)}, sat ${Math.round(sat)})`);
    }
  }

  nonWhite.sort();
  await writeFile(OUT, `${JSON.stringify(nonWhite, null, 2)}\n`);
  console.log(`\n${nonWhite.length} of ${files.length} SKUs are not white-background -> ${OUT}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
