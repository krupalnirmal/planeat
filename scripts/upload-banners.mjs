import 'dotenv/config';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const DIR = 'public/banners';
const OUT = 'public/banners/cloudinary-map.json';

const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
const apiKey = process.env.CLOUDINARY_API_KEY;
const apiSecret = process.env.CLOUDINARY_API_SECRET;

function sha1Hex(input) {
  return crypto.createHash('sha1').update(input).digest('hex');
}

async function uploadOne(slug, buffer) {
  const timestamp = Math.floor(Date.now() / 1000);
  const folder = 'planeat/banners';
  const publicId = slug;

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
    throw new Error(`Upload failed for ${slug}: ${json.error?.message ?? res.status}`);
  }
  return json.secure_url;
}

async function main() {
  const files = (await readdir(DIR)).filter((f) => f.endsWith('.jpg'));
  const map = {};
  for (const file of files) {
    const slug = path.basename(file, '.jpg');
    const buffer = await readFile(path.join(DIR, file));
    const url = await uploadOne(slug, buffer);
    map[slug] = url;
    console.log(`${slug} -> ${url}`);
  }
  await writeFile(OUT, JSON.stringify(map, null, 2));
  console.log(`\nWrote ${Object.keys(map).length} entries to ${OUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
