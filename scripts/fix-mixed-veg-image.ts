import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import crypto from 'node:crypto';
import { db } from '../src/lib/db';

/**
 * Adds a real image to VEG-CHOP-MIXED ("Mixed Cut Vegetables"), which
 * shipped without one earlier this session — no single existing product
 * photo could honestly represent a mixed pack, and no real photo of this
 * exact SKU exists to source. The fix: a genuine composite of 4 of this
 * catalogue's own real chopped-vegetable photos (carrot/cabbage/capsicum/
 * cauliflower, already licensed and already in use elsewhere), the same
 * "real photos of the catalogue's own products, clustered" technique the
 * home page's hero banner already uses for its own generic collage — not
 * a fabricated or generated image.
 *
 * Does NOT touch VEG-CHOP-BEANS, AATA-JWARI-5KG, or AATA-MULTIGRAIN-5KG —
 * none of those have any existing photo in the catalogue that honestly
 * represents them (a wheat-flour photo doesn't accurately depict jwari or
 * multigrain flour, and there is no beans photo anywhere to reuse or
 * composite from), so they're left flagged rather than given a misleading
 * image.
 */

const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
const apiKey = process.env.CLOUDINARY_API_KEY;
const apiSecret = process.env.CLOUDINARY_API_SECRET;

function sha1Hex(input: string): string {
  return crypto.createHash('sha1').update(input).digest('hex');
}

async function uploadOne(publicId: string, buffer: Buffer): Promise<string> {
  const timestamp = Math.floor(Date.now() / 1000);
  const folder = 'planeat/products';

  const toSign = `folder=${folder}&public_id=${publicId}&timestamp=${timestamp}`;
  const signature = sha1Hex(`${toSign}${apiSecret}`);

  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(buffer)], { type: 'image/jpeg' }));
  form.append('api_key', apiKey!);
  form.append('timestamp', String(timestamp));
  form.append('folder', folder);
  form.append('public_id', publicId);
  form.append('signature', signature);

  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`, {
    method: 'POST',
    body: form,
  });
  const json = (await res.json()) as { secure_url?: string; error?: { message?: string } };
  if (!res.ok || !json.secure_url) {
    throw new Error(`Upload failed for ${publicId}: ${json.error?.message ?? res.status}`);
  }
  return json.secure_url;
}

async function main() {
  if (!cloudName || !apiKey || !apiSecret) throw new Error('Missing CLOUDINARY_* env vars');

  const path =
    'C:/Users/Krupal/AppData/Local/Temp/claude/e--MyProject-PlanEat/0fc286d1-5255-4c88-8132-d76b4f4953e5/scratchpad/mixed-veg/mixed-cut-vegetables-final.jpg';
  const buffer = await readFile(path);
  const url = await uploadOne('veg-chop-mixed', buffer);
  console.log('uploaded:', url);

  const result = await db.product.updateMany({
    where: { sku: 'VEG-CHOP-MIXED' },
    data: { imageUrls: [url] },
  });
  console.log(`updated ${result.count} product row(s)`);
}

main()
  .catch((error) => {
    console.error('ERR', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
