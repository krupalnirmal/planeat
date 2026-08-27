/**
 * Lists — and with `--delete`, removes — Cloudinary assets under planeat/
 * that nothing in the repo references any more.
 *
 * Run with:
 *   node scripts/cloudinary-prune.mjs            # dry run, lists only
 *   node scripts/cloudinary-prune.mjs --delete   # actually deletes
 *
 * "Referenced" means the asset's public_id appears EITHER in a checked-in
 * URL map OR in the live database (product photos, banner creatives,
 * category icons). Both matter: `planeat/products` and `planeat/banners`
 * take runtime uploads from the admin panel as well as seed uploads from
 * the scripts, so a repo-only check would flag every admin-uploaded photo
 * as an orphan and delete the shop's own product images.
 *
 * `planeat/delivery-proof` and `planeat/smart-list` are never touched at
 * all: those hold photos uploaded by delivery partners and customers at
 * runtime, they are evidence rather than assets, and nothing in the repo or
 * the catalogue tables references them by URL.
 */

import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import crypto from 'node:crypto';
import { db } from '../src/lib/db';

/** Runtime/user content — out of scope for an asset prune, always. */
const PROTECTED_PREFIXES = ['planeat/delivery-proof/', 'planeat/smart-list/'];

const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
const apiKey = process.env.CLOUDINARY_API_KEY;
const apiSecret = process.env.CLOUDINARY_API_SECRET;

if (!cloudName || !apiKey || !apiSecret) {
  console.error('Missing CLOUDINARY_* env vars');
  process.exit(1);
}

const AUTH = `Basic ${Buffer.from(`${apiKey}:${apiSecret}`).toString('base64')}`;

/** Every checked-in file that maps a name to a Cloudinary URL. */
const URL_MAPS = [
  'public/products/cloudinary-map.json',
  'public/banners/cloudinary-map.json',
  'src/lib/catalog/category-tile-cloudinary-map.json',
  'src/lib/catalog/subgroup-tile-cloudinary-map.json',
];

/** .../upload/v1234567890/planeat/products/veg-onion.jpg -> planeat/products/veg-onion */
function publicIdFromUrl(url: unknown): string | null {
  if (typeof url !== 'string') return null;
  const match = url.match(/\/upload\/(?:v\d+\/)?(.+?)(?:\.[a-z0-9]+)?$/i);
  return match ? match[1] : null;
}

async function referencedPublicIds() {
  const ids = new Set();

  for (const file of URL_MAPS) {
    let map;
    try {
      map = JSON.parse(await readFile(file, 'utf8'));
    } catch {
      continue;
    }
    for (const url of Object.values(map)) {
      const id = publicIdFromUrl(url);
      if (id) ids.add(id);
    }
  }

  // The live catalogue too — anything the admin uploaded through the app
  // exists only here, never in a checked-in map.
  const [products, banners, categories] = await Promise.all([
    db.product.findMany({ select: { imageUrls: true } }),
    db.banner.findMany({ select: { imageUrl: true } }),
    db.category.findMany({ select: { iconUrl: true } }),
  ]);

  for (const product of products) {
    const urls = Array.isArray(product.imageUrls) ? product.imageUrls : [];
    for (const url of urls) {
      const id = publicIdFromUrl(url);
      if (id) ids.add(id);
    }
  }
  for (const banner of banners) {
    const id = publicIdFromUrl(banner.imageUrl);
    if (id) ids.add(id);
  }
  for (const category of categories) {
    const id = publicIdFromUrl(category.iconUrl);
    if (id) ids.add(id);
  }

  return ids;
}

async function listResources() {
  const all = [];
  for (const type of ['upload']) {
    let cursor;
    do {
      const url = new URL(`https://api.cloudinary.com/v1_1/${cloudName}/resources/image`);
      url.searchParams.set('type', type);
      url.searchParams.set('prefix', 'planeat/');
      url.searchParams.set('max_results', '500');
      if (cursor) url.searchParams.set('next_cursor', cursor);

      const res = await fetch(url, { headers: { authorization: AUTH } });
      if (!res.ok) throw new Error(`list failed: ${res.status} ${await res.text()}`);
      const json = await res.json();
      all.push(...(json.resources ?? []));
      cursor = json.next_cursor;
    } while (cursor);
  }
  return all;
}

async function destroy(publicId: string) {
  const timestamp = Math.floor(Date.now() / 1000);
  const toSign = `public_id=${publicId}&timestamp=${timestamp}`;
  const signature = crypto.createHash('sha1').update(`${toSign}${apiSecret}`).digest('hex');

  const form = new FormData();
  form.append('public_id', publicId);
  form.append('timestamp', String(timestamp));
  form.append('api_key', apiKey as string);
  form.append('signature', signature);

  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/destroy`, {
    method: 'POST',
    body: form,
  });
  const json = await res.json();
  if (json.result !== 'ok') throw new Error(`destroy ${publicId}: ${JSON.stringify(json)}`);
}

async function main() {
  const doDelete = process.argv.includes('--delete');
  const referenced = await referencedPublicIds();
  const resources = await listResources();

  const protectedCount = resources.filter((r) =>
    PROTECTED_PREFIXES.some((prefix) => r.public_id.startsWith(prefix)),
  ).length;

  const orphans = resources.filter(
    (r) =>
      !referenced.has(r.public_id) &&
      !PROTECTED_PREFIXES.some((prefix) => r.public_id.startsWith(prefix)),
  );
  const bytes = orphans.reduce((sum, r) => sum + (r.bytes ?? 0), 0);

  console.info(`planeat/ assets on Cloudinary: ${resources.length}`);
  console.info(`referenced (repo + database):  ${referenced.size}`);
  console.info(`protected runtime uploads:     ${protectedCount}`);
  console.info(`orphans:                       ${orphans.length} (${(bytes / 1024 / 1024).toFixed(1)} MB)\n`);

  for (const orphan of orphans) {
    console.info(`  ${orphan.public_id}`);
  }

  if (!doDelete) {
    console.info('\nDry run. Re-run with --delete to remove these.');
    return;
  }

  for (const orphan of orphans) {
    await destroy(orphan.public_id);
    console.info(`deleted ${orphan.public_id}`);
  }
  console.info(`\nDeleted ${orphans.length} orphan(s).`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
