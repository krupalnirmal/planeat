// PWA icon generator (P10 — M11). Not part of the app runtime; run with
// `node scripts/generate-icons.mjs` whenever the brand mark changes. Uses
// `sharp`, already present as a transitive Next.js dependency, so no new
// package is added just for this.
//
// Session 2026-09-22 — the client provided the real getFresh app icon
// (`public/icons/source.png`, 1254x1254, opaque). This replaces the earlier
// placeholder sprout mark this file used to draw in code (a stand-in the
// file's own old comment said to replace "the moment the client provides
// one" — that moment is now).
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';

const SOURCE = 'public/icons/source.png';
// Sampled from the source image's own corner pixel — the maskable variant's
// padding needs to match the icon's real background, not an arbitrary white.
const ICON_BG = { r: 247, g: 248, b: 247 };

mkdirSync('public/icons', { recursive: true });

const jobs = [
  { file: 'public/icons/icon-192.png', size: 192, safeZone: false },
  { file: 'public/icons/icon-512.png', size: 512, safeZone: false },
  { file: 'public/icons/icon-maskable-512.png', size: 512, safeZone: true },
];

for (const job of jobs) {
  if (!job.safeZone) {
    // Regular icons: the source is already a clean 1:1 square, so a plain
    // resize is a faithful crop — no letterboxing needed.
    await sharp(SOURCE).resize(job.size, job.size).png().toFile(job.file);
  } else {
    // Maskable: the OS crops to a circle/rounded-square, so the artwork
    // needs to sit inside the middle ~70% safe zone rather than bleed to
    // the edge — composited onto a canvas in the icon's own background
    // colour so the padding is invisible, not an arbitrary letterbox.
    const inner = Math.round(job.size * 0.7);
    const resized = await sharp(SOURCE).resize(inner, inner).toBuffer();
    await sharp({
      create: {
        width: job.size,
        height: job.size,
        channels: 3,
        background: ICON_BG,
      },
    })
      .composite([{ input: resized, gravity: 'center' }])
      .png()
      .toFile(job.file);
  }
  console.info(`wrote ${job.file}`);
}
