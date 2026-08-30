/**
 * Re-fetches catalogue photos, preferring ones shot on a plain white
 * backdrop (client request, session 2026-08-27: every product card should
 * look like a studio shot, not a field or market photo).
 *
 * Run with: node scripts/fetch-white-bg-images.mjs [SKU ...]
 *
 * How it differs from `fetch-product-images.mjs`, which it complements
 * rather than replaces: that script takes the single most RELEVANT Commons
 * result for one search term. This one runs several "on white" phrasings per
 * SKU, downloads every candidate, MEASURES how white each one's border
 * actually is, and keeps the whitest that clears a threshold. Commons has no
 * "white background" metadata to filter on, so measuring the pixels is the
 * only way to tell.
 *
 * A SKU whose photo is already white is skipped, and a SKU with no
 * white-background candidate keeps whatever it has — a correct photo on a
 * wooden board beats a white-background photo of the wrong vegetable.
 */

import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const OUT_DIR = 'public/products';
const WIDTH = 600;
const API = 'https://commons.wikimedia.org/w/api.php';
const UA = 'Planeat-seed-image-fetcher/1.0 (krupalnirmal0301@gmail.com)';
const DELAY_MS = 1_000;

/** Border must be at least this bright and this colourless to count as white. */
const MIN_LUM = 215;
const MAX_SAT = 28;
/** How many search results to actually download and measure, per query. */
const CANDIDATES_PER_QUERY = 6;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * SKU → the plain noun to search for. Kept separate from
 * `fetch-product-images.mjs`'s terms because those are tuned for relevance
 * ("Zingiber officinale rhizome"), while these get "isolated on white"
 * appended and want the everyday word a photographer would caption with.
 */
const NOUNS = {
  'VEG-ONION': 'red onions',
  'VEG-TOMATO': 'tomatoes',
  'VEG-POTATO': 'potatoes',
  'VEG-BRINJAL': 'eggplant aubergine',
  'VEG-OKRA': 'okra ladies finger',
  'VEG-BOTTLEGOURD': 'bottle gourd calabash',
  'VEG-CABBAGE': 'cabbage',
  'VEG-CAULIFLOWER': 'cauliflower',
  'VEG-CARROT': 'carrots',
  'VEG-BEETROOT': 'beetroot',
  'VEG-CUCUMBER': 'cucumber',
  'VEG-CAPSICUM': 'green bell pepper',
  'VEG-GREENCHILLI': 'green chili peppers',
  'VEG-GARLIC': 'garlic bulbs',
  'VEG-GINGER': 'ginger root',
  'VEG-PUMPKIN': 'pumpkin',
  'VEG-RIDGEGOURD': 'ridge gourd luffa',
  'VEG-SPINACH': 'spinach leaves',
  'VEG-FENUGREEK': 'fenugreek leaves methi',
  'VEG-CORIANDER': 'coriander leaves cilantro',
  'VEG-CURRYLEAVES': 'curry leaves',
  'VEG-CLUSTERBEANS': 'cluster beans guar',
  'VEG-FRESHPEANUT': 'peanuts groundnuts',
  'FRT-APPLE': 'red apple',
  'FRT-BANANA': 'bananas',
  'FRT-MOSAMBI': 'sweet lime mosambi',
  'FRT-PAPAYA': 'papaya',
  'FRT-POMEGRANATE': 'pomegranate',
  'FRT-LEMON': 'lemons',
  'FRT-ORANGE': 'orange fruit',
  'FRT-MANGO': 'mango',
  'FRT-WATERMELON': 'watermelon',
  'FRT-JAMUN': 'jamun java plum',
  'FRT-KIWI': 'kiwifruit',
  'FRT-DRAGONFRUIT': 'dragon fruit pitaya',
  'FRT-AVOCADO': 'avocado',
  'FRT-BLUEBERRY': 'blueberries',
  'FRT-ALMOND': 'almonds',
  'FRT-CASHEW': 'cashew nuts',
  'FRT-WALNUT': 'walnuts',
  'FRT-RAISINS': 'raisins',
  'DRY-MILK-500': 'glass of milk',
  'DRY-CURD-400': 'yogurt curd bowl',
  'DRY-PANEER-200': 'paneer cottage cheese',
  'DRY-GHEE-500': 'ghee clarified butter jar',
  'DRY-BUTTERMILK-500': 'buttermilk glass',
  'DRY-YOGURT-100': 'yogurt cup',
  'DRY-CHEESESLICE-200': 'cheese slices',
  'DRY-CHEESECUBE-200': 'cheese cubes',
  'DRY-BUTTER-100': 'butter',
  'BKY-BREAD-400': 'sliced bread loaf',
  'BKY-PAV-6': 'bread rolls buns',
  'BKY-MARIE-250': 'biscuits cookies',
  'BKY-BREAD-WHITE-400': 'white bread loaf sliced',
  'BKY-BUN-BURGER-4': 'burger buns',
  'BKY-CREAMBISCUIT-150': 'cream biscuits sandwich',
  'BKY-GLUCOSE-200': 'glucose biscuits',
  'BKY-RUSK-200': 'rusk toast bread',
  'BKY-CAKE-300': 'butter cake slice',
};

/** Same trap as the relevance script: a plausible title that is the wrong thing. */
const REJECT_IF_TITLE_CONTAINS = {
  'VEG-GINGER': ['etlingera', 'torch', 'flower', 'ornamental'],
  'VEG-SPINACH': ['tree', 'new zealand', 'water spinach'],
  'FRT-BANANA': ['plant', 'tree', 'flower', 'vendor', 'market', 'plantation'],
  'FRT-MANGO': ['tree', 'comedian', 'leaf', 'blossom'],
  'FRT-APPLE': ['tomato', 'illustration', 'poster', 'logo', 'inc'],
  'VEG-FRESHPEANUT': ['butter', 'jar', 'köhler', 'medizinal'],
  'DRY-CHEESESLICE-200': ['fondue', 'omelette', 'pizza', 'burger', 'sandwich'],
  'DRY-MILK-500': ['coffee', 'tea', 'chocolate', 'goat', 'carton', 'bottle collection'],
};

/**
 * Titles to reject for EVERY SKU. Ranking on whiteness pulls scientific
 * imagery to the top, because that is exactly the material shot on a plain
 * white field: searching "cauliflower" returned a Julia-set fractal
 * (mathematicians call the shape a cauliflower) and "eggplant" returned a
 * plant-pathology photo of scab lesions. Both scored a perfect white border.
 */
const ALWAYS_REJECT = [
  'julia set', 'fractal', 'mandelbrot', 'field lines',
  'scab', 'disease', 'blight', 'mildew', 'lesion', 'rot', 'virus', 'pest',
  'deficiency', 'symptom', 'infected', 'damage',
  'herbarium', 'specimen', 'botanical', 'illustration', 'drawing',
  'engraving', 'diagram', 'chart', 'map ', 'logo', 'icon', 'coat of arms',
  'microscop', 'cross section', 'seedling', 'germination',
];

const OK_LICENCE = /^(cc0|public domain|cc by|cc by-sa|pd)/i;

function isAlwaysRejected(title) {
  const lower = title.toLowerCase();
  return ALWAYS_REJECT.some((word) => lower.includes(word));
}

/**
 * Words too generic to prove a photo is of the right thing — a title can
 * contain "green" or "fresh" and be anything at all.
 */
const WEAK_WORDS = new Set([
  'green', 'white', 'fresh', 'sweet', 'whole', 'sliced', 'indian', 'black',
  'yellow', 'leaves', 'fruit', 'root', 'bulbs', 'seeds', 'glass', 'bowl',
]);

/**
 * Ranking purely on whiteness happily picks a photo of something else that
 * happens to be shot on white: searching "cauliflower" this way returned a
 * Julia-set fractal (mathematicians call the shape a "cauliflower"), which
 * scored a perfect white border. So the title has to actually name the
 * thing — at least one distinctive word from the noun, crudely singularised.
 */
function titleMentions(noun, title) {
  const lower = title.toLowerCase();
  const words = noun
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word.length >= 5 && !WEAK_WORDS.has(word));

  // Every word was generic (e.g. "glass of milk") — fall back to the whole
  // set rather than accepting anything.
  const probes = words.length > 0 ? words : noun.toLowerCase().split(/\s+/).filter((w) => w.length >= 4);

  return probes.some((word) => lower.includes(word.replace(/s$/, '')));
}

function stripHtml(value) {
  return String(value ?? '')
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isRejected(sku, title) {
  const words = REJECT_IF_TITLE_CONTAINS[sku];
  if (!words) return false;
  const lower = title.toLowerCase();
  return words.some((word) => lower.includes(word));
}

/**
 * Mean luminance and colour spread of the outer 10% ring. A product shot on
 * white has a bright, colourless border however colourful the subject is.
 */
async function borderWhiteness(buffer) {
  const { data, info } = await sharp(buffer)
    .resize(120, 120, { fit: 'cover' })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width: w, height: h, channels: c } = info;
  const band = Math.max(1, Math.round(w * 0.1));

  let n = 0;
  let sumLum = 0;
  let sumSat = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!(x < band || x >= w - band || y < band || y >= h - band)) continue;
      const i = (y * w + x) * c;
      const max = Math.max(data[i], data[i + 1], data[i + 2]);
      const min = Math.min(data[i], data[i + 1], data[i + 2]);
      sumLum += (max + min) / 2;
      sumSat += max - min;
      n++;
    }
  }
  return { lum: sumLum / n, sat: sumSat / n };
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

  const pages = Object.values((await res.json())?.query?.pages ?? {});
  return pages
    .map((page) => ({ title: page.title, info: page.imageinfo?.[0] }))
    .filter((entry) => entry.info)
    .filter((entry) => /\.(jpe?g|png)$/i.test(entry.title))
    .filter((entry) => entry.info.width >= 400 && entry.info.height >= 300);
}

async function bestWhiteCandidate(sku, noun) {
  const queries = [
    `${noun} white background`,
    `${noun} isolated white`,
    `${noun} on white`,
  ];

  let best = null;
  const seen = new Set();

  for (const query of queries) {
    await sleep(DELAY_MS);
    let candidates;
    try {
      candidates = await searchCommons(query);
    } catch {
      continue;
    }

    let checked = 0;
    for (const candidate of candidates) {
      if (checked >= CANDIDATES_PER_QUERY) break;
      if (seen.has(candidate.title)) continue;
      seen.add(candidate.title);
      if (isAlwaysRejected(candidate.title)) continue;
      if (isRejected(sku, candidate.title)) continue;
      if (!titleMentions(noun, candidate.title)) continue;

      const licence = stripHtml(candidate.info.extmetadata?.LicenseShortName?.value) || 'unknown';
      if (!OK_LICENCE.test(licence)) continue;

      checked++;
      try {
        const src = candidate.info.thumburl ?? candidate.info.url;
        const res = await fetch(src, { headers: { 'user-agent': UA } });
        if (!res.ok) continue;
        const buffer = Buffer.from(await res.arrayBuffer());
        const { lum, sat } = await borderWhiteness(buffer);
        if (lum < MIN_LUM || sat > MAX_SAT) continue;
        // Rank by luminance: among photos that all clear the bar, the
        // brightest border is the cleanest cut-out.
        if (!best || lum > best.lum) {
          best = { buffer, lum, sat, licence, query, title: candidate.title, info: candidate.info };
        }
      } catch {
        // Skip an individual bad download rather than losing the SKU.
      }
    }
  }

  return best;
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  const only = new Set(process.argv.slice(2));
  const existingFiles = new Set(
    (await readdir(OUT_DIR)).filter((f) => f.endsWith('.jpg')).map((f) => f.replace('.jpg', '')),
  );

  let attributions = [];
  try {
    attributions = JSON.parse(await readFile(path.join(OUT_DIR, 'attribution.json'), 'utf8'));
  } catch {
    // First run — nothing to preserve.
  }

  const replaced = [];
  const kept = [];
  const skipped = [];

  for (const [sku, noun] of Object.entries(NOUNS)) {
    if (only.size > 0 && !only.has(sku)) continue;

    // Already on white? Leave it alone — re-rolling a good photo risks
    // trading it for a worse one that merely scores higher.
    if (existingFiles.has(sku)) {
      const current = await borderWhiteness(await readFile(path.join(OUT_DIR, `${sku}.jpg`)));
      if (current.lum >= MIN_LUM && current.sat <= MAX_SAT) {
        skipped.push(sku);
        continue;
      }
    }

    const best = await bestWhiteCandidate(sku, noun);
    if (!best) {
      kept.push(sku);
      continue;
    }

    await sharp(best.buffer)
      .resize(WIDTH, WIDTH, { fit: 'cover', position: 'centre' })
      .jpeg({ quality: 82 })
      .toFile(path.join(OUT_DIR, `${sku}.jpg`));

    const title = best.title.replace(/^File:/, '');
    attributions = attributions.filter((entry) => entry.sku !== sku);
    attributions.push({
      sku,
      term: `${best.query} (white-background pass, session 2026-08-27)`,
      title,
      artist: stripHtml(best.info.extmetadata?.Artist?.value) || 'Unknown',
      licence: best.licence,
      source: `https://commons.wikimedia.org/wiki/File:${title.replace(/ /g, '_')}`,
    });

    replaced.push(`${sku} (lum ${Math.round(best.lum)})`);
    console.info(`${sku.padEnd(22)} -> ${title}`);
  }

  attributions.sort((a, b) => a.sku.localeCompare(b.sku));
  await writeFile(
    path.join(OUT_DIR, 'attribution.json'),
    `${JSON.stringify(attributions, null, 2)}\n`,
  );

  const rows = attributions
    .map((a) => `| \`${a.sku}\` | [${a.title}](${a.source}) | ${a.artist} | ${a.licence} |`)
    .join('\n');
  await writeFile(
    path.join(OUT_DIR, 'ATTRIBUTION.md'),
    `# Product image attribution\n\nEvery image in this folder comes from Wikimedia Commons, fetched by\n\`scripts/fetch-product-images.mjs\` or \`scripts/fetch-white-bg-images.mjs\`.\nThey are demo catalogue assets: the shop owner replaces them with photos of\ntheir own stock from the admin panel. Licences are recorded here because\nseveral require credit.\n\n| SKU | Photo | Author | Licence |\n|---|---|---|---|\n${rows}\n`,
  );

  console.info(`\nreplaced: ${replaced.length}`);
  console.info(`already white, skipped: ${skipped.length}`);
  console.info(`no white candidate found, kept existing: ${kept.length}`);
  if (kept.length > 0) console.info(`  ${kept.join(', ')}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
