/**
 * Fetches one freely-licensed photo per catalogue product from Wikimedia
 * Commons and writes it to `public/products/<sku>.jpg`, alongside an
 * ATTRIBUTION.md recording who took each photo and under what licence.
 *
 * Run with: node scripts/fetch-product-images.mjs
 *
 * These are DEMO CATALOGUE ASSETS, deliberately kept out of
 * `public/uploads/` — that directory is for things uploaded at runtime by the
 * storage port (D-20, D-43), and mixing seeded assets into it would mean a
 * demo reset or an uploads cleanup could wipe the catalogue's images.
 *
 * The search term per SKU is deliberately specific ("bottle gourd lauki", not
 * "gourd"): a wrong photo in a grocery app is worse than no photo, and worse
 * still in one that carries allergen rules (S4). Every downloaded image is
 * checked by eye against `scripts/contact-sheet.mjs` before the seed points at
 * it.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const OUT_DIR = 'public/products';
const WIDTH = 600;
const API = 'https://commons.wikimedia.org/w/api.php';

// Wikimedia's policy requires a User-Agent identifying the tool and a way to
// contact whoever runs it; without one the API answers 429 after a handful of
// requests. The 1s delay below is the other half of being a good citizen.
const UA = 'Planeat-seed-image-fetcher/1.0 (krupalnirmal0301@gmail.com)';
const DELAY_MS = 1_000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * SKU → what to search Commons for. Specific on purpose, and several use the
 * scientific name — "ginger" alone matches ornamental torch-ginger flowers
 * (Etlingera elatior) far more often than the actual cooking rhizome
 * (Zingiber officinale) on Commons, and the same trap catches "spinach",
 * "tomato" and a handful of others below. Found by reviewing every download
 * against `scripts/contact-sheet.mjs` rather than trusting the first result.
 */
const SEARCHES = {
  'VEG-ONION': 'red onion bulb vegetable',
  'VEG-TOMATO': 'organic tomatoes ripe',
  'VEG-POTATO': 'potato tuber vegetable',
  'VEG-BRINJAL': 'aubergine vegetable',
  'VEG-OKRA': 'okra Abelmoschus esculentus pods raw',
  'VEG-BOTTLEGOURD': 'bottle gourd',
  'VEG-RIDGEGOURD': 'turai vegetable',
  'VEG-CLUSTERBEANS': 'cluster beans guar cyamopsis pods',
  'VEG-FENUGREEK': 'fenugreek leaves methi greens',
  'VEG-FRESHPEANUT': 'raw peanuts',
  'VEG-SPINACH': 'spinach leaves bunch green vegetable',
  'VEG-CORIANDER': 'Coriandrum sativum coriander leaves bunch fresh',
  'VEG-CURRYLEAVES': 'curry leaves murraya koenigii',
  'VEG-CABBAGE': 'cabbage head green vegetable',
  'VEG-CAULIFLOWER': 'cauliflower head white vegetable',
  'VEG-CARROT': 'carrot orange root vegetable',
  'VEG-GREENCHILLI': 'green chillies Kerala',
  'VEG-GINGER': 'fresh ginger root farmers market',
  'VEG-GARLIC': 'garlic bulbs cloves',
  'VEG-PUMPKIN': 'pumpkin orange squash vegetable',
  'VEG-BEETROOT': 'beetroot',
  'VEG-CAPSICUM': 'bell pepper capsicum green',
  'VEG-CUCUMBER': 'cucumber green vegetable',
  'FRT-BANANA': 'bunch of bananas yellow ripe fruit',
  'FRT-APPLE': 'apple fruit red whole',
  'FRT-MOSAMBI': 'sweet lime mosambi citrus fruit',
  'FRT-PAPAYA': 'papaya fruit ripe',
  'FRT-POMEGRANATE': 'pomegranate fruit arils',
  'FRT-LEMON': 'lemon citrus fruit yellow',
  'DRY-MILK-500': 'person pouring milk glass',
  'DRY-CURD-400': 'yogurt bowl',
  'DRY-PANEER-200': 'paneer',
  'DRY-GHEE-500': 'clarified butter ghee',
  'DRY-BUTTERMILK-500': 'buttermilk glass',
  'DRY-YOGURT-100': 'strawberry yogurt bowl',
  'DRY-CHEESESLICE-200': 'cheddar cheese sliced',
  'DRY-CHEESECUBE-200': 'cheese cube organic plate',
  'DRY-BUTTER-100': 'butter block',
  'BKY-BREAD-400': 'sliced white bread loaf',
  'BKY-PAV-6': 'pav bread buns indian',
  'BKY-MARIE-250': 'tea biscuits plate',
  'ICE-VANILLA-700': 'vanilla ice cream scoop',
  'ICE-KULFI-4': 'kulfi',
  'GRC-TOORDAL-1KG': 'yellow split peas dal',
  'GRC-RICE-5KG': 'basmati rice grains raw',
  'GRC-ATTA-5KG': 'wheat flour atta',
  'GRC-OIL-1L': 'sunflower cooking oil bottle',
  'GRC-SUGAR-1KG': 'white sugar crystals',
  'GRC-TEA-250': 'black tea leaves dried',

  // Fruits sub-group rail (session 2026-08-26) — Citrus/Seasonal/Exotic/Dry
  // Fruits SKUs added alongside the sidebar grouping. Search terms lean on
  // "isolated white background" / "studio" since these render in a rail of
  // tiles where a consistent look matters more than for the full-bleed
  // vegetable photos above.
  'FRT-ORANGE': 'orange fruit whole citrus',
  'FRT-MANGO': 'mango fruit',
  'FRT-WATERMELON': 'watermelon fruit slice red',
  'FRT-JAMUN': 'Syzygium cumini jamun java plum fruit',
  'FRT-KIWI': 'kiwifruit whole and sliced',
  'FRT-DRAGONFRUIT': 'pitaya hylocereus fruit',
  'FRT-AVOCADO': 'avocado halved pit',
  'FRT-BLUEBERRY': 'blueberries basket harvest',
  'FRT-ALMOND': 'almonds shelled nuts',
  'FRT-CASHEW': 'cashew nuts bowl',
  'FRT-WALNUT': 'walnuts shelled nuts',
  'FRT-RAISINS': 'raisins dried grapes',
};

/**
 * SKUs whose photos are resized with white letterboxing (`contain` + flatten)
 * instead of the cropped `cover` fit used everywhere else, so the new Fruits
 * rail (session 2026-08-26) reads as one consistent set of tiles rather than
 * a mix of whatever background each source photo happened to have.
 */
const WHITE_BG_SKUS = new Set([
  'FRT-ORANGE', 'FRT-MANGO', 'FRT-WATERMELON', 'FRT-JAMUN', 'FRT-KIWI',
  'FRT-DRAGONFRUIT', 'FRT-AVOCADO', 'FRT-BLUEBERRY', 'FRT-ALMOND',
  'FRT-CASHEW', 'FRT-WALNUT', 'FRT-RAISINS',
]);

/** Re-fetch only these SKUs when given on the command line; otherwise all. */
const ONLY = new Set(process.argv.slice(2));

/**
 * Commons' server-side `-word` search exclusion turned out unreliable (it
 * still returned "Ginger Rogers as Roxie Hart" for a ginger-root search), so
 * candidates are over-fetched and filtered here instead, against each SKU's
 * own list of words that mean "wrong match" for that product specifically.
 */
const REJECT_IF_TITLE_CONTAINS = {
  'VEG-TOMATO': ['illustration', 'poster', 'engraving', 'label', 'advertisement', 'bolgiano'],
  'VEG-BRINJAL': ['curry', 'dish', 'cooked', 'bhaji', 'phrik', 'kapi', 'sauce', 'lasagne'],
  'VEG-GINGER': ['rogers', 'roxie', 'hart', 'torch', 'flower', 'etlingera', 'actress'],
  'VEG-SPINACH': ['flower', 'flowering'],
  'VEG-GREENCHILLI': ['dish', 'sauce', 'curry', 'plate'],
  'VEG-BEETROOT': ['halwa', 'roasted', 'salad', 'flower', 'leaves', 'greens'],
  'VEG-BOTTLEGOURD': ['flower'],
  'VEG-GREENCHILLI': ['baccatum', 'гравче', 'drying', 'square crop', 'dzoraghbyur', 'dried', 'red'],
  'DRY-PANEER-200': ['pizza', 'kebab', 'sabzi', 'jalfrezi', 'chilly', 'capsicum sabzi'],
  'ICE-KULFI-4': ['pistatxo'],
  'VEG-RIDGEGOURD': ['abandoned', 'field'],
  'VEG-FRESHPEANUT': ['butter', 'jar', 'köhler', 'medizinal'],
  'FRT-APPLE': ['tomato', 'illustration', 'poster'],
  'DRY-MILK-500': [
    'carton', 'goat', 'chemical', 'testing', 'analysis', 'cream',
    'illustration', 'encyclopedia', 'larousse', 'litres', 'tin',
  ],
  'DRY-CURD-400': ['meal', 'plate', 'thali', 'granola', 'frozen', 'pretzel', 'fig', 'seaweed'],
  'DRY-GHEE-500': ['margarine', 'kettle', 'dosa', 'idli'],
  'BKY-MARIE-250': ['illustration', 'portrait', 'painting', 'homes and gardens', 'victoria daily', 'vailima'],
  'GRC-TOORDAL-1KG': ['dosa', 'uttapam', 'curry', 'dish', 'pudding'],
  'GRC-ATTA-5KG': ['great wall', 'atta kim', 'mountain', 'landscape'],
  'VEG-CUCUMBER': ['curly', 'thailand', 'indonesian', 'dressing', 'goddess', 'dip', 'platter'],
  'FRT-MANGO': ['asmussen', 'portrait', 'comedian', 'people', 'illustration', 'market', 'display', 'basket', 'stall', 'shark', 'tree', 'branch', 'unripe'],
  'FRT-AVOCADO': ['asmussen', 'portrait', 'comedian', 'people', 'illustration'],
  'FRT-WATERMELON': ['pumpkin', 'squash', 'wounded', 'art', 'sculpture'],
  'FRT-CASHEW': ['brazil nut', 'shell halves', 'coconut'],
  'DRY-BUTTERMILK-500': ['making', 'churn', 'butter-'],
  'DRY-CHEESESLICE-200': ['fondue', 'omelette', 'pizza', 'burger', 'market', 'apple pie', 'triscuit', 'crispbread', 'sauerkraut', 'sausage', 'chops', 'herring', 'toast'],
};

function isRejected(sku, title) {
  const words = REJECT_IF_TITLE_CONTAINS[sku];
  if (!words) return false;
  const lower = title.toLowerCase();
  return words.some((word) => lower.includes(word));
}

/** Licences we accept without further thought. Anything else is reported. */
const OK_LICENCE = /^(cc0|public domain|cc by|cc by-sa|pd)/i;

function stripHtml(value) {
  return String(value ?? '')
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function searchCommons(term) {
  const url = new URL(API);
  url.search = new URLSearchParams({
    action: 'query',
    format: 'json',
    generator: 'search',
    gsrsearch: term,
    gsrnamespace: '6',
    gsrlimit: '20',
    prop: 'imageinfo',
    iiprop: 'url|size|extmetadata',
    iiurlwidth: String(WIDTH),
  }).toString();

  const res = await fetch(url, { headers: { 'user-agent': UA } });
  if (!res.ok) throw new Error(`Commons search failed: ${res.status}`);

  const json = await res.json();
  const pages = Object.values(json?.query?.pages ?? {});

  return pages
    .map((page) => ({ title: page.title, info: page.imageinfo?.[0] }))
    .filter((entry) => entry.info)
    // `search` ranks by relevance; keep that order rather than sorting by
    // resolution, which would happily prefer a huge botanical diagram over
    // the obvious photo of the vegetable.
    //
    // Match on the TITLE, not the URL — Commons appends `?utm_source=…` to
    // every image URL it hands back, so an extension test against the URL
    // silently rejects every single result.
    .filter((entry) => /\.(jpe?g|png)$/i.test(entry.title))
    .filter((entry) => entry.info.width >= 400 && entry.info.height >= 300);
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  // Re-running with a SKU filter (as every fix-up pass above did) must not
  // erase the attribution rows for the SKUs that were already right — this
  // file is a legal record of who took each photo, not a log of the last run.
  let attributions = [];
  if (ONLY.size > 0) {
    try {
      const existing = JSON.parse(await readFile(path.join(OUT_DIR, 'attribution.json'), 'utf8'));
      attributions = existing.filter((entry) => !ONLY.has(entry.sku));
    } catch {
      // No prior file — nothing to preserve.
    }
  }

  const failures = [];

  for (const [sku, term] of Object.entries(SEARCHES)) {
    if (ONLY.size > 0 && !ONLY.has(sku)) continue;
    try {
      await sleep(DELAY_MS);

      const candidates = await searchCommons(term);
      const best = candidates.find((entry) => !isRejected(sku, entry.title));
      if (!best) {
        failures.push({ sku, reason: 'no usable search result' });
        continue;
      }

      const info = best.info;
      const meta = info.extmetadata ?? {};
      const licence = stripHtml(meta.LicenseShortName?.value) || 'unknown';
      const artist = stripHtml(meta.Artist?.value) || 'Unknown';
      const title = best.title.replace(/^File:/, '');

      const src = info.thumburl ?? info.url;
      const imageRes = await fetch(src, { headers: { 'user-agent': UA } });
      if (!imageRes.ok) throw new Error(`download failed: ${imageRes.status}`);

      const buffer = Buffer.from(await imageRes.arrayBuffer());

      // Square: cropped to fill for most SKUs (a squashed 4:3 photo looks
      // broken on a phone), but letterboxed onto white for WHITE_BG_SKUS so
      // that rail reads as one consistent set regardless of each source
      // photo's own background.
      const pipeline = sharp(buffer);
      if (WHITE_BG_SKUS.has(sku)) {
        pipeline.resize(WIDTH, WIDTH, { fit: 'contain', background: '#ffffff' }).flatten({ background: '#ffffff' });
      } else {
        pipeline.resize(WIDTH, WIDTH, { fit: 'cover', position: 'centre' });
      }
      await pipeline.jpeg({ quality: 82 }).toFile(path.join(OUT_DIR, `${sku}.jpg`));

      attributions.push({
        sku,
        term,
        title,
        artist,
        licence,
        source: info.descriptionurl ?? `https://commons.wikimedia.org/wiki/${best.title}`,
      });
      console.info(`${sku.padEnd(18)} ${licence.padEnd(14)} ${title}`);

      if (!OK_LICENCE.test(licence)) {
        failures.push({ sku, reason: `licence needs review: ${licence}` });
      }
    } catch (error) {
      failures.push({ sku, reason: error instanceof Error ? error.message : String(error) });
    }
  }

  attributions.sort((a, b) => a.sku.localeCompare(b.sku));

  const lines = [
    '# Product image attribution',
    '',
    'Every image in this folder comes from Wikimedia Commons, fetched by',
    '`scripts/fetch-product-images.mjs`. They are demo catalogue assets: the',
    'shop owner replaces them with photos of their own stock from the admin',
    'panel. Licences are recorded here because several require credit.',
    '',
    '| SKU | Photo | Author | Licence |',
    '|---|---|---|---|',
    ...attributions.map(
      (a) => `| \`${a.sku}\` | [${a.title}](${a.source}) | ${a.artist} | ${a.licence} |`,
    ),
    '',
  ];
  await writeFile(path.join(OUT_DIR, 'ATTRIBUTION.md'), lines.join('\n'), 'utf8');
  await writeFile(
    path.join(OUT_DIR, 'attribution.json'),
    JSON.stringify(attributions, null, 2),
    'utf8',
  );

  console.info(`\n${attributions.length}/${Object.keys(SEARCHES).length} images written.`);
  if (failures.length > 0) {
    console.info('\nNeeds attention:');
    for (const failure of failures) console.info(`  ${failure.sku}: ${failure.reason}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
