// One-off generator for the PWA icons (P10 — M11). Not part of the app
// runtime; run with `node scripts/generate-icons.mjs` whenever the brand mark
// changes. Uses `sharp`, already present as a transitive Next.js dependency,
// so no new package is added just for this.
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';

// The Planeat brand mark: yellow field, black glyph, green leaf accent —
// matching the logotype's own "P" tile (fork/spoon/leaf on a speed-line P).
const YELLOW = '#FFD400';
const BLACK = '#111111';
const GREEN = '#16A34A';

// This is a placeholder mark, not a redraw of the client's actual "P" logo:
// reproducing that exact fork/spoon/leaf glyph by hand in SVG risks not
// matching the real asset closely enough to be worth it. A sprout in the
// brand's own black-on-yellow-on-green is closer to the brand than the old
// green-on-green mark was, and is a straightforward swap for the real file
// the moment the client provides one (drop it in `public/icons/source.*` and
// point `jobs` below at `sharp(sourcePath)` instead of this function).
function sprout(size, { safeZone = false } = {}) {
  // Maskable icons are cropped to a circle/rounded-square by the OS, so the
  // artwork has to sit inside the middle ~80% safe zone.
  const scale = safeZone ? 0.62 : 0.8;
  const cx = size / 2;
  const cy = size / 2;
  const r = (size * scale) / 2;

  return `
<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${size}" height="${size}" fill="${YELLOW}"/>
  <g transform="translate(${cx} ${cy})" fill="none" stroke="${BLACK}" stroke-width="${r * 0.16}" stroke-linecap="round" stroke-linejoin="round">
    <path d="M 0 ${r * 0.85} L 0 ${-r * 0.35}"/>
    <path d="M 0 ${-r * 0.1}
             C ${-r * 0.75} ${-r * 0.1}, ${-r * 0.9} ${-r * 0.75}, ${-r * 0.55} ${-r * 0.95}
             C ${-r * 0.15} ${-r * 0.7}, 0 ${-r * 0.1}, 0 ${-r * 0.1} Z"
          fill="${BLACK}" stroke="none"/>
    <path d="M 0 ${-r * 0.1}
             C ${r * 0.75} ${-r * 0.1}, ${r * 0.9} ${-r * 0.75}, ${r * 0.55} ${-r * 0.95}
             C ${r * 0.15} ${-r * 0.7}, 0 ${-r * 0.1}, 0 ${-r * 0.1} Z"
          fill="${GREEN}" stroke="none"/>
  </g>
</svg>`;
}

mkdirSync('public/icons', { recursive: true });

const jobs = [
  { file: 'public/icons/icon-192.png', size: 192, safeZone: false },
  { file: 'public/icons/icon-512.png', size: 512, safeZone: false },
  { file: 'public/icons/icon-maskable-512.png', size: 512, safeZone: true },
];

for (const job of jobs) {
  await sharp(Buffer.from(sprout(job.size, { safeZone: job.safeZone })))
    .png()
    .toFile(job.file);
  console.info(`wrote ${job.file}`);
}
