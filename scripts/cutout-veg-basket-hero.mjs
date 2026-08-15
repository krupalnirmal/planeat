import sharp from 'sharp';

/**
 * One-off: the client-supplied basket photo (public/promo/veg-basket-hero)
 * was shot on a flat, evenly-lit near-white backdrop (#f7f7f7) - close
 * enough to the page's white background to look intentional in isolation,
 * but once --surface went pure #ffffff the ~3% difference read as a faint
 * grey border around the photo everywhere it's used (splash, onboarding,
 * login, every LoginPrompt screen).
 *
 * A real background-removal model isn't available here, but the backdrop is
 * flat enough that a soft chroma-key threshold gets a clean cutout: pixels
 * close to the known background colour become transparent, pixels far from
 * it (the colourful vegetables) stay fully opaque, with a linear ramp in
 * between so the edge doesn't look jagged. Re-run this if the source photo
 * is ever replaced - the original flat JPEG lives outside the repo, same
 * reasoning as the other raw reference material in ../planeat-reference.
 */

const SRC = '../planeat-reference/veg-basket-hero-source.jpg';
const OUT = 'public/promo/veg-basket-hero.png';
const MAX_WIDTH = 700;

const BACKGROUND_RGB = [247, 247, 247];
const THRESHOLD_LOW = 10; // below this distance from the backdrop colour: fully transparent
const THRESHOLD_HIGH = 45; // above this distance: fully opaque

async function main() {
  const { data, info } = await sharp(SRC).raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;

  const rgba = Buffer.alloc(width * height * 4);
  for (let i = 0, p = 0; i < data.length; i += channels, p += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const distance = Math.max(
      Math.abs(r - BACKGROUND_RGB[0]),
      Math.abs(g - BACKGROUND_RGB[1]),
      Math.abs(b - BACKGROUND_RGB[2]),
    );

    let alpha;
    if (distance <= THRESHOLD_LOW) alpha = 0;
    else if (distance >= THRESHOLD_HIGH) alpha = 255;
    else alpha = Math.round(((distance - THRESHOLD_LOW) / (THRESHOLD_HIGH - THRESHOLD_LOW)) * 255);

    rgba[p] = r;
    rgba[p + 1] = g;
    rgba[p + 2] = b;
    rgba[p + 3] = alpha;
  }

  await sharp(rgba, { raw: { width, height, channels: 4 } })
    .resize({ width: MAX_WIDTH, withoutEnlargement: true })
    .png({ compressionLevel: 9 })
    .toFile(OUT);

  console.log(`Wrote ${OUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
