import 'dotenv/config';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const DIR = 'public/products';
const OUT = 'public/products/cloudinary-map.json';

const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
const apiKey = process.env.CLOUDINARY_API_KEY;
const apiSecret = process.env.CLOUDINARY_API_SECRET;

if (!cloudName || !apiKey || !apiSecret) {
  console.error('Missing CLOUDINARY_* env vars');
  process.exit(1);
}

function sha1Hex(input) {
  return crypto.createHash('sha1').update(input).digest('hex');
}

async function uploadOne(sku, buffer) {
  const timestamp = Math.floor(Date.now() / 1000);
  const folder = 'planeat/products';
  const publicId = sku.toLowerCase();

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
    throw new Error(`Upload failed for ${sku}: ${json.error?.message ?? res.status}`);
  }
  return json.secure_url;
}

async function main() {
  const files = (await readdir(DIR)).filter((f) => f.endsWith('.jpg'));
  const map = {};

  for (const file of files) {
    const sku = path.basename(file, '.jpg');
    const buffer = await readFile(path.join(DIR, file));
    const url = await uploadOne(sku, buffer);
    map[sku] = url;
    console.log(`${sku} -> ${url}`);
  }

  await writeFile(OUT, JSON.stringify(map, null, 2));
  console.log(`\nWrote ${Object.keys(map).length} entries to ${OUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
