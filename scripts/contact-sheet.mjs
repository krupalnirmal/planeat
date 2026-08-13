// Build a labelled grid of every downloaded product photo, so a human (or a
// vision-capable review step) can catch a wrong match before the seed ever
// points at it. Not part of the app; delete after review.
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const DIR = 'public/products';
const TILE = 200;
const COLS = 7;

async function main() {
  const files = (await readdir(DIR)).filter((f) => f.endsWith('.jpg')).sort();
  const rows = Math.ceil(files.length / COLS);

  const labelHeight = 22;
  const cellH = TILE + labelHeight;
  const canvas = sharp({
    create: {
      width: COLS * TILE,
      height: rows * cellH,
      channels: 3,
      background: '#ffffff',
    },
  });

  const composites = [];
  for (const [i, file] of files.entries()) {
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    const x = col * TILE;
    const y = row * cellH;

    const resized = await sharp(path.join(DIR, file))
      .resize(TILE, TILE, { fit: 'cover' })
      .toBuffer();
    composites.push({ input: resized, left: x, top: y });

    const label = Buffer.from(
      `<svg width="${TILE}" height="${labelHeight}"><rect width="100%" height="100%" fill="black"/><text x="4" y="15" font-size="12" fill="white" font-family="monospace">${file.replace('.jpg', '')}</text></svg>`,
    );
    composites.push({ input: label, left: x, top: y + TILE });
  }

  await canvas.composite(composites).jpeg({ quality: 85 }).toFile('scripts/contact-sheet.jpg');
  console.info(`scripts/contact-sheet.jpg (${files.length} images, ${COLS} per row)`);
}

main();
