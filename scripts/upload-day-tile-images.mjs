import 'dotenv/config';
import crypto from 'node:crypto';

/**
 * One-off upload for the weekly-summary day-tile food photos (session
 * 2026-10-29, client reference) — cropped directly out of the client's own
 * reference screenshot with sharp (circular, transparent background), same
 * approach as upload-meal-plan-home-images.mjs. Re-run only if the
 * selection changes; the printed URLs are pasted into day-style.ts by hand.
 */

const SRC_DIR =
  'C:/Users/Krupal/AppData/Local/Temp/claude/e--MyProject-PlanEat/0fc286d1-5255-4c88-8132-d76b4f4953e5/scratchpad/day-cards';

const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
const apiKey = process.env.CLOUDINARY_API_KEY;
const apiSecret = process.env.CLOUDINARY_API_SECRET;

const FILES = {
  'day-tile-mon': 'c3-mon.png',
  'day-tile-tue': 'c3-tue.png',
  'day-tile-wed': 'c3-wed.png',
  'day-tile-thu': 'c3-thu.png',
  'day-tile-fri': 'c3-fri.png',
  'day-tile-sat': 'c3-sat.png',
  'day-tile-sun': 'c3-sun.png',
};

function sha1Hex(input) {
  return crypto.createHash('sha1').update(input).digest('hex');
}

async function uploadOne(publicId, buffer) {
  const timestamp = Math.floor(Date.now() / 1000);
  const folder = 'planeat/meal-plan-home';

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

async function main() {
  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error('Missing CLOUDINARY_* env vars');
  }

  const { readFile } = await import('node:fs/promises');
  const path = await import('node:path');

  const map = {};
  for (const [publicId, file] of Object.entries(FILES)) {
    const buffer = await readFile(path.join(SRC_DIR, file));
    const url = await uploadOne(publicId, buffer);
    map[publicId] = url;
    console.log(`${publicId} -> ${url}`);
  }

  console.log('\n' + JSON.stringify(map, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
