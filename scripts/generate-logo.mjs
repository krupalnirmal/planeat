// One-off generator for the real getFresh wordmark asset (session
// 2026-09-22, client-provided logo). Run with `node scripts/generate-logo.mjs`
// whenever the brand mark changes. Trims the source PNG's transparent
// margin (it already ships with a real alpha channel — confirmed via
// `sharp().metadata()`/a corner-pixel sample before writing this) and
// re-exports at a web-friendly width, replacing every text-span "Get"/
// "Freesh" wordmark across the app with this real image.
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';

const SOURCE = 'public/brand/source-logo.png';
const TARGET_WIDTH = 900;

mkdirSync('public/brand', { recursive: true });

const trimmedBuffer = await sharp(SOURCE).trim().png().toBuffer();
const meta = await sharp(trimmedBuffer).metadata();
const targetHeight = Math.round((meta.height / meta.width) * TARGET_WIDTH);

// Full mark — leaf/arc/wordmark + the "FRESHNESS DELIVERED" caption —
// for spots with room to breathe (splash screen, footer).
await sharp(trimmedBuffer).resize(TARGET_WIDTH, targetHeight).png().toFile('public/brand/logo.png');
console.info(`wrote public/brand/logo.png (${TARGET_WIDTH}x${targetHeight})`);

// Compact mark — wordmark only, caption cropped off (measured via a
// per-row opaque-pixel-count scan of the full-size trim: ink density drops
// sharply around 86% of the height, where the bold wordmark ends and the
// much thinner caption begins) — for header-height contexts where the
// caption would render unreadably small anyway.
const compactHeight = Math.round(meta.height * 0.86);
const compactTargetHeight = Math.round((compactHeight / meta.width) * TARGET_WIDTH);
await sharp(trimmedBuffer)
  .extract({ left: 0, top: 0, width: meta.width, height: compactHeight })
  .resize(TARGET_WIDTH, compactTargetHeight)
  .png()
  .toFile('public/brand/logo-compact.png');
console.info(`wrote public/brand/logo-compact.png (${TARGET_WIDTH}x${compactTargetHeight})`);

// Wordmark-only mark — no arc, no leaves, no caption, just "getFreesh"
// (session 2026-09-23, client report — the 'g' looked cut off/illegible in
// small headers). Root cause: `logo-compact.png` still carries the arc+
// leaves above the text, so at a ~28-32px CSS header height the actual
// letters were squeezed into only a sliver of that box, crushing the 'g'
// loop's thin stroke to sub-pixel. Cropping to just the text row (found via
// the same row-density scan: near-flat ~180px/row "floor" from the arc's
// bottom chord ends and density jumps past 400 around y=460 of the 774px
// full trim, up to the same 86%-height caption cutoff above) gives the
// letters the full height budget instead. This is what every
// header-height logo instance should use from now on — `logo-compact.png`
// stays only for contexts with real room to show the arc+leaves too.
const wordmarkTop = Math.round((460 / 774) * meta.height);
const wordmarkBottom = compactHeight;
const wordmarkTrimmed = await sharp(trimmedBuffer)
  .extract({ left: 0, top: wordmarkTop, width: meta.width, height: wordmarkBottom - wordmarkTop })
  .trim()
  .png()
  .toBuffer();
const wordmarkMeta = await sharp(wordmarkTrimmed).metadata();
const wordmarkTargetHeight = Math.round((wordmarkMeta.height / wordmarkMeta.width) * TARGET_WIDTH);
await sharp(wordmarkTrimmed)
  .resize(TARGET_WIDTH, wordmarkTargetHeight)
  .png()
  .toFile('public/brand/logo-wordmark.png');
console.info(`wrote public/brand/logo-wordmark.png (${TARGET_WIDTH}x${wordmarkTargetHeight})`);
