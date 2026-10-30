import 'dotenv/config';
import crypto from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * One-off upload for the 25 missing-vegetable/fruit product photos the
 * client sent (GF.zip, session 2026-10-30) — branded on-white photos, used
 * as-is (no cropping needed, unlike the day-tile batch). Re-run only if the
 * selection changes; `scripts/add-missing-products.ts` reads these printed
 * URLs by public_id, this script doesn't write them anywhere itself.
 */

const SRC_DIR = 'E:/MyProject/PlanEat/.scratch-gf-final/GF';

const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
const apiKey = process.env.CLOUDINARY_API_KEY;
const apiSecret = process.env.CLOUDINARY_API_SECRET;

const FILES = {
  // vegetables
  'veg-small-brinjal': 'vegitables/लहान वांगे (Small Brinjal).jpg',
  'veg-bharit-brinjal': 'vegitables/भरीत वांगे (Bharit Brinjal).jpg',
  'veg-chawli-sheng': 'vegitables/चवळी शेंग (Fresh Chawali Sheng).jpg',
  'veg-gilke': 'vegitables/गिलके (Ridge Gourd).jpg',
  'veg-shevga': 'vegitables/शेवगा (Drumstick) .jpg',
  'veg-popti-val': 'vegitables/पोपटी वाल.jpg',
  'veg-motha-val': 'vegitables/मोठा वाल.jpg',
  'veg-kashiphal': 'vegitables/काशीफळ (Pumpkin).jpg',
  'veg-karle': 'vegitables/कारले (Bitter Gourd).jpg',
  'veg-chuka': 'vegitables/चुका (Sorrel Leaves).jpg',
  'veg-vatane': 'vegitables/वाटाणे (Fresh Green Peas.jpg',
  'veg-broccoli': 'vegitables/ब्रोकली (Broccoli).jpg',
  'veg-beans': 'vegitables/बीन्स (French Beans).jpg',
  'veg-poka-bhaji': 'vegitables/पोका-पोकळा भाजी (Green Amaranth).jpg',
  'veg-mushroom': 'vegitables/मशरूम (Button Mushroom).jpg',
  'veg-tondli': 'vegitables/तोंडली (Ivy Gourd).jpg',
  // fruits
  'fruit-guava': 'fruites/पेरू (Guava).jpg',
  'fruit-custard-apple': 'fruites/सीताफळ (Custard Apple).jpg',
  'fruit-ber': 'fruites/बोरं (Ber - Jujube).jpg',
  'fruit-grapes': 'fruites/द्राक्षे (Grapes).jpg',
  'fruit-strawberry': 'fruites/स्ट्रॉबेरी (Strawberries).jpg',
  'fruit-figs': 'fruites/अंजीर (Figs).jpg',
  // daily-use variants
  'veg-red-carrot': 'daily_use_vegis/लाल गाजर.jpg',
  'veg-thick-green-chilli': 'daily_use_vegis/जाड हिरवी मिरची.jpg',
  'veg-thin-green-chilli': 'daily_use_vegis/बारिक हिरवी मिरची.jpg',
  'veg-white-salad-cucumber': 'daily_use_vegis/व्हाईट सलाद काकडी (White Salad Cucumber).jpg',
  'veg-green-cucumber': 'daily_use_vegis/ग्रीन काकडी (Green Cucumber).jpg',
};

function sha1Hex(input) {
  return crypto.createHash('sha1').update(input).digest('hex');
}

async function uploadOne(publicId, buffer) {
  const timestamp = Math.floor(Date.now() / 1000);
  const folder = 'planeat/catalogue';

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
