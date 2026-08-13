// One-off generator for home-screen promo banners — the same "finished
// creative baked into the pixels" approach `generate-icons.mjs` uses for the
// PWA icons, so `BannerCarousel` (which shows each slide at its own natural
// size, never cropped) has real marketing images instead of an empty table.
// Run with: node scripts/generate-banners.mjs
import sharp from 'sharp';
import { mkdirSync, readFileSync } from 'node:fs';

const GREEN = '#16A34A';
const GREEN_DARK = '#0F5C2E';
const YELLOW = '#FFD400';

const WIDTH = 1200;
const HEIGHT = 480;

function photoDataUri(sku) {
  const buf = readFileSync(`public/products/${sku}.jpg`);
  return `data:image/jpeg;base64,${buf.toString('base64')}`;
}

/**
 * A photo circle, clipped and positioned — used to build the little produce
 * cluster on the right side of each banner, echoing the fallback hero's
 * "real catalogue photos, not a stock illustration" rule.
 */
function photoCircle(sku, cx, cy, r, rotate = 0) {
  const uri = photoDataUri(sku);
  return `
    <g transform="rotate(${rotate} ${cx} ${cy})">
      <clipPath id="clip-${sku}-${cx}-${cy}">
        <circle cx="${cx}" cy="${cy}" r="${r}" />
      </clipPath>
      <image href="${uri}" x="${cx - r}" y="${cy - r}" width="${r * 2}" height="${r * 2}"
             preserveAspectRatio="xMidYMid slice" clip-path="url(#clip-${sku}-${cx}-${cy})" />
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="white" stroke-width="6" />
    </g>`;
}

function banner({ headline, sub, badge, photos }) {
  return `
<svg width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${GREEN}" />
      <stop offset="100%" stop-color="${GREEN_DARK}" />
    </linearGradient>
  </defs>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#bg)" />

  <!-- decorative rings -->
  <circle cx="${WIDTH - 60}" cy="60" r="180" fill="white" opacity="0.05" />
  <circle cx="${WIDTH - 260}" cy="${HEIGHT - 40}" r="120" fill="white" opacity="0.05" />

  <g font-family="Lohit Devanagari, Noto Sans, sans-serif">
    <rect x="64" y="70" width="230" height="56" rx="28" fill="${YELLOW}" />
    <text x="179" y="106" font-size="26" font-weight="700" fill="#111111" text-anchor="middle">${badge}</text>

    <text x="64" y="220" font-size="56" font-weight="700" fill="white">
      ${headline.map((line, i) => `<tspan x="64" dy="${i === 0 ? 0 : 72}">${line}</tspan>`).join('')}
    </text>
    <text x="64" y="${220 + (headline.length - 1) * 72 + 60}" font-size="26" fill="white" opacity="0.9">${sub}</text>
  </g>

  ${photos.map((p) => photoCircle(...p)).join('')}
</svg>`;
}

const BANNERS = [
  {
    file: 'public/banners/welcome-offer.jpg',
    svg: banner({
      badge: '₹50 सूट',
      headline: ['पहिल्या ऑर्डरवर', '₹50 सूट!'],
      sub: 'कोड नाही, आपोआप लागू होते',
      photos: [
        ['VEG-TOMATO', 900, 150, 100, -8],
        ['VEG-ONION', 1040, 260, 90, 6],
        ['FRT-APPLE', 940, 370, 80, -4],
      ],
    }),
  },
  {
    file: 'public/banners/fresh-daily.jpg',
    svg: banner({
      badge: '30 मिनिटांत',
      headline: ['ताजा भाजीपाला,', 'रोज घरपोच'],
      sub: 'शेतापासून थेट तुमच्या दारात, दररोज सकाळी',
      photos: [
        ['VEG-SPINACH', 900, 150, 100, -6],
        ['VEG-CARROT', 1040, 260, 90, 8],
        ['VEG-CAPSICUM', 940, 370, 80, -4],
      ],
    }),
  },
];

mkdirSync('public/banners', { recursive: true });

for (const b of BANNERS) {
  await sharp(Buffer.from(b.svg)).jpeg({ quality: 90 }).toFile(b.file);
  console.info(`wrote ${b.file}`);
}
