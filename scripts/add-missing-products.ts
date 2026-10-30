import 'dotenv/config';
import { addAlias, createProduct, upsertVariant } from '../src/lib/admin/catalogue';
import { db } from '../src/lib/db';
import { UnitType } from '../src/generated/prisma/enums';

/**
 * Client-sent missing-item batch (session 2026-10-30, GF.zip + WhatsApp
 * price ranges) — 16 vegetables, 6 fruits and 5 daily-use vegetable
 * variants the catalogue didn't have yet. Prices use the midpoint of each
 * ₹ range the client gave, rounded to a clean number, in the same
 * weightLadder/bunch style `prisma/seed.ts` already uses. Deletes itself
 * after running — one-off, not app code.
 *
 * Deliberately skipped (not in this batch):
 * - "भोपळा (Generic)" — the client's own photo filename labels it
 *   "दुधी भोपळा - Bottle Gourd", which already exists as VEG-BOTTLEGOURD.
 * - "मुळा" (Radish), "कांद्याची पात" (Spring Onion Greens) and "सलाद Orange
 *   गाजर" — priced by the client but no photo arrived in GF.zip.
 * - "शिमला मिरची" — already exists as VEG-CAPSICUM (ढोबळी मिरची), same
 *   vegetable.
 */

interface VariantSeed {
  label: string;
  quantity: number;
  unit: UnitType;
  pricePaise: bigint;
  mrpPaise: bigint;
  stockQty: number;
  lowStockThreshold: number;
  isDefault: boolean;
  isActive: boolean;
}

function weightLadder(pricePerKg: number, stock = 30): VariantSeed[] {
  const half = Math.round(pricePerKg / 2);
  const quarter = Math.round(pricePerKg / 4);
  return [
    { label: '250 g', quantity: 250, unit: UnitType.G, pricePaise: BigInt(quarter * 100), mrpPaise: BigInt((quarter + 2) * 100), stockQty: stock, lowStockThreshold: 5, isDefault: false, isActive: true },
    { label: '500 g', quantity: 500, unit: UnitType.G, pricePaise: BigInt(half * 100), mrpPaise: BigInt((half + 4) * 100), stockQty: stock, lowStockThreshold: 5, isDefault: true, isActive: true },
    { label: '1 kg', quantity: 1000, unit: UnitType.G, pricePaise: BigInt(pricePerKg * 100), mrpPaise: BigInt((pricePerKg + 8) * 100), stockQty: stock, lowStockThreshold: 5, isDefault: false, isActive: true },
  ];
}

function bunch(price: number, stock = 25): VariantSeed[] {
  return [
    { label: '1 जुडी', quantity: 1, unit: UnitType.BUNCH, pricePaise: BigInt(price * 100), mrpPaise: BigInt((price + 3) * 100), stockQty: stock, lowStockThreshold: 5, isDefault: true, isActive: true },
  ];
}

function smallPack(stock = 20): VariantSeed[] {
  return [
    { label: '200 g', quantity: 200, unit: UnitType.G, pricePaise: BigInt(4500), mrpPaise: BigInt(5200), stockQty: stock, lowStockThreshold: 5, isDefault: true, isActive: true },
  ];
}

interface Spec {
  sku: string;
  en: string;
  mr: string;
  hi: string;
  category: 'vegetables' | 'fruits';
  image: string;
  unitType: UnitType;
  tags: string[];
  aliases: string[];
  variants: ReturnType<typeof weightLadder>;
}

const IMG = (publicId: string) =>
  `https://res.cloudinary.com/kf9nvvpv/image/upload/planeat/catalogue/${publicId}.webp`;

const SPECS: Spec[] = [
  // ── Vegetables (₹ range midpoint, rounded) ──────────────────────────
  {
    sku: 'VEG-SMALLBRINJAL',
    en: 'Small Brinjal',
    mr: 'लहान वांगे',
    hi: 'छोटा बैंगन',
    category: 'vegetables',
    image: IMG('veg-small-brinjal'),
    unitType: UnitType.G,
    tags: ['fibre', 'low-calorie', 'allergen:brinjal'],
    aliases: ['lahan vange', 'small brinjal', 'gol vangi', 'लहान वांगी'],
    variants: weightLadder(48),
  },
  {
    sku: 'VEG-BHARITBRINJAL',
    en: 'Bharit Brinjal',
    mr: 'भरीत वांगे',
    hi: 'भरीत बैंगन',
    category: 'vegetables',
    image: IMG('veg-bharit-brinjal'),
    unitType: UnitType.G,
    tags: ['fibre', 'low-calorie', 'allergen:brinjal'],
    aliases: ['bharit vange', 'bharit brinjal', 'mothe vangi', 'भरीत वांगी'],
    variants: weightLadder(53),
  },
  {
    sku: 'VEG-CHAWLISHENG',
    en: 'Chawli Sheng (Fresh Cowpea)',
    mr: 'चवळी शेंग',
    hi: 'चवली सेम',
    category: 'vegetables',
    image: IMG('veg-chawli-sheng'),
    unitType: UnitType.G,
    tags: ['protein', 'fibre', 'pod'],
    aliases: ['chawli sheng', 'chawli beans', 'cowpea pods', 'चवळी शेंगा'],
    variants: weightLadder(50),
  },
  {
    sku: 'VEG-GILKE',
    en: 'Gilke (Sponge Gourd)',
    mr: 'गिलके',
    hi: 'घोसावली',
    category: 'vegetables',
    image: IMG('veg-gilke'),
    unitType: UnitType.G,
    tags: ['low-calorie', 'fibre'],
    aliases: ['gilke', 'ghosavali', 'sponge gourd', 'गिलकी'],
    variants: weightLadder(53),
  },
  {
    sku: 'VEG-SHEVGA',
    en: 'Drumstick',
    mr: 'शेवगा',
    hi: 'सहजन',
    category: 'vegetables',
    image: IMG('veg-shevga'),
    unitType: UnitType.G,
    tags: ['fibre', 'iron'],
    aliases: ['shevga', 'drumstick', 'sahjan', 'moringa', 'शेवग्याची शेंग'],
    variants: weightLadder(75),
  },
  {
    sku: 'VEG-POPTIVAL',
    en: 'Popti Val (Fresh Lablab Beans)',
    mr: 'पोपटी वाल',
    hi: 'पोपटी वाल',
    category: 'vegetables',
    image: IMG('veg-popti-val'),
    unitType: UnitType.G,
    tags: ['protein', 'pod'],
    aliases: ['popti val', 'val papdi', 'lablab beans'],
    variants: weightLadder(60),
  },
  {
    sku: 'VEG-MOTHAVAL',
    en: 'Motha Val (Large Lablab Beans)',
    mr: 'मोठा वाल',
    hi: 'बड़ा वाल',
    category: 'vegetables',
    image: IMG('veg-motha-val'),
    unitType: UnitType.G,
    tags: ['protein', 'pod'],
    aliases: ['motha val', 'moth val', 'large val'],
    variants: weightLadder(60),
  },
  {
    sku: 'VEG-KASHIPHAL',
    en: 'Kashiphal (Pumpkin)',
    mr: 'काशीफळ',
    hi: 'कद्दू',
    category: 'vegetables',
    image: IMG('veg-kashiphal'),
    unitType: UnitType.G,
    tags: ['low-calorie', 'vitamin-a'],
    aliases: ['kashiphal', 'kaddu', 'pumpkin', 'भोपळा'],
    variants: weightLadder(30),
  },
  {
    sku: 'VEG-KARLE',
    en: 'Bitter Gourd',
    mr: 'कारले',
    hi: 'करेला',
    category: 'vegetables',
    image: IMG('veg-karle'),
    unitType: UnitType.G,
    tags: ['low-calorie', 'diabetes-friendly'],
    aliases: ['karle', 'karela', 'bitter gourd', 'करेला'],
    variants: weightLadder(58),
  },
  {
    sku: 'VEG-CHUKA',
    en: 'Chuka (Sorrel Leaves)',
    mr: 'चुका',
    hi: 'चुका भाजी',
    category: 'vegetables',
    image: IMG('veg-chuka'),
    unitType: UnitType.BUNCH,
    tags: ['leafy', 'iron'],
    aliases: ['chuka', 'sorrel leaves', 'चुका भाजी'],
    variants: bunch(20),
  },
  {
    sku: 'VEG-VATANE',
    en: 'Fresh Green Peas',
    mr: 'वाटाणे',
    hi: 'हरी मटर',
    category: 'vegetables',
    image: IMG('veg-vatane'),
    unitType: UnitType.G,
    tags: ['protein', 'fibre'],
    aliases: ['vatane', 'matar', 'green peas', 'हिरवा वाटाणा'],
    variants: weightLadder(75),
  },
  {
    sku: 'VEG-BROCCOLI',
    en: 'Broccoli',
    mr: 'ब्रोकली',
    hi: 'ब्रोकली',
    category: 'vegetables',
    image: IMG('veg-broccoli'),
    unitType: UnitType.G,
    tags: ['exotic', 'fibre', 'antioxidant'],
    aliases: ['broccoli', 'ब्रोकोली'],
    variants: weightLadder(125),
  },
  {
    sku: 'VEG-BEANS',
    en: 'French Beans',
    mr: 'बीन्स',
    hi: 'फ्रेंच बीन्स',
    category: 'vegetables',
    image: IMG('veg-beans'),
    unitType: UnitType.G,
    tags: ['fibre', 'protein'],
    aliases: ['beans', 'french beans', 'bins', 'बिन्स'],
    variants: weightLadder(80),
  },
  {
    sku: 'VEG-POKABHAJI',
    en: 'Poka Bhaji (Green Amaranth)',
    mr: 'पोकळा भाजी',
    hi: 'चौलाई भाजी',
    category: 'vegetables',
    image: IMG('veg-poka-bhaji'),
    unitType: UnitType.BUNCH,
    tags: ['leafy', 'iron'],
    aliases: ['poka bhaji', 'pokala bhaji', 'green amaranth', 'पोका भाजी'],
    variants: bunch(20),
  },
  {
    sku: 'VEG-MUSHROOM',
    en: 'Button Mushroom',
    mr: 'मशरूम',
    hi: 'मशरूम',
    category: 'vegetables',
    image: IMG('veg-mushroom'),
    unitType: UnitType.G,
    tags: ['protein', 'low-calorie'],
    aliases: ['mushroom', 'button mushroom', 'मशरूम'],
    variants: smallPack(),
  },
  {
    sku: 'VEG-TONDLI',
    en: 'Tondli (Ivy Gourd)',
    mr: 'तोंडली',
    hi: 'कुंदरू',
    category: 'vegetables',
    image: IMG('veg-tondli'),
    unitType: UnitType.G,
    tags: ['low-calorie', 'fibre'],
    aliases: ['tondli', 'tendli', 'ivy gourd', 'kundru', 'तेंडली'],
    variants: weightLadder(53),
  },
  // ── Fruits ───────────────────────────────────────────────────────────
  {
    sku: 'FRT-GUAVA',
    en: 'Guava',
    mr: 'पेरू',
    hi: 'अमरूद',
    category: 'fruits',
    image: IMG('fruit-guava'),
    unitType: UnitType.G,
    tags: ['fibre', 'vitamin-c'],
    aliases: ['peru', 'amrud', 'guava', 'अमरूद'],
    variants: weightLadder(70),
  },
  {
    sku: 'FRT-CUSTARDAPPLE',
    en: 'Custard Apple',
    mr: 'सीताफळ',
    hi: 'शरीफा',
    category: 'fruits',
    image: IMG('fruit-custard-apple'),
    unitType: UnitType.G,
    tags: ['seasonal', 'energy'],
    aliases: ['sitaphal', 'sharifa', 'custard apple', 'सीताफळ'],
    variants: weightLadder(90),
  },
  {
    sku: 'FRT-BER',
    en: 'Ber (Jujube)',
    mr: 'बोरं',
    hi: 'बेर',
    category: 'fruits',
    image: IMG('fruit-ber'),
    unitType: UnitType.G,
    tags: ['seasonal', 'vitamin-c'],
    aliases: ['bor', 'ber', 'jujube', 'बोर'],
    variants: weightLadder(40),
  },
  {
    sku: 'FRT-GRAPES',
    en: 'Grapes',
    mr: 'द्राक्षे',
    hi: 'अंगूर',
    category: 'fruits',
    image: IMG('fruit-grapes'),
    unitType: UnitType.G,
    tags: ['seasonal', 'antioxidant'],
    aliases: ['draksha', 'angur', 'grapes', 'अंगूर'],
    variants: weightLadder(140),
  },
  {
    sku: 'FRT-STRAWBERRY',
    en: 'Strawberry',
    mr: 'स्ट्रॉबेरी',
    hi: 'स्ट्रॉबेरी',
    category: 'fruits',
    image: IMG('fruit-strawberry'),
    unitType: UnitType.G,
    tags: ['exotic', 'vitamin-c', 'antioxidant'],
    aliases: ['strawberry', 'स्ट्रॉबेरी'],
    variants: [
      { label: '200 g', quantity: 200, unit: UnitType.G, pricePaise: BigInt(24000), mrpPaise: BigInt(27000), stockQty: 15, lowStockThreshold: 5, isDefault: true, isActive: true },
    ],
  },
  {
    sku: 'FRT-FIGS',
    en: 'Fresh Figs',
    mr: 'अंजीर',
    hi: 'अंजीर',
    category: 'fruits',
    image: IMG('fruit-figs'),
    unitType: UnitType.G,
    tags: ['fibre', 'seasonal'],
    aliases: ['anjeer', 'figs', 'अंजीर'],
    variants: weightLadder(130),
  },
  // ── Daily-use vegetable variants ────────────────────────────────────
  {
    sku: 'VEG-REDCARROT',
    en: 'Red Carrot',
    mr: 'लाल गाजर',
    hi: 'लाल गाजर',
    category: 'vegetables',
    image: IMG('veg-red-carrot'),
    unitType: UnitType.G,
    tags: ['vitamin-a', 'root'],
    aliases: ['lal gajar', 'red carrot', 'लाल गाजर'],
    variants: weightLadder(50),
  },
  {
    sku: 'VEG-THICKGREENCHILLI',
    en: 'Thick Green Chilli',
    mr: 'जाड हिरवी मिरची',
    hi: 'मोटी हरी मिर्च',
    category: 'vegetables',
    image: IMG('veg-thick-green-chilli'),
    unitType: UnitType.G,
    tags: ['spice'],
    aliases: ['jad hirvi mirchi', 'thick green chilli', 'जाड मिरची'],
    variants: weightLadder(60),
  },
  {
    sku: 'VEG-THINGREENCHILLI',
    en: 'Thin Green Chilli',
    mr: 'बारीक हिरवी मिरची',
    hi: 'पतली हरी मिर्च',
    category: 'vegetables',
    image: IMG('veg-thin-green-chilli'),
    unitType: UnitType.G,
    tags: ['spice'],
    aliases: ['barik hirvi mirchi', 'thin green chilli', 'बारीक मिरची'],
    variants: weightLadder(70),
  },
  {
    sku: 'VEG-WHITESALADCUCUMBER',
    en: 'White Salad Cucumber',
    mr: 'सलाद (व्हाईट) काकडी',
    hi: 'सलाद खीरा (सफेद)',
    category: 'vegetables',
    image: IMG('veg-white-salad-cucumber'),
    unitType: UnitType.G,
    tags: ['hydrating', 'low-calorie'],
    aliases: ['white salad cucumber', 'salad kakdi', 'सलाद काकडी'],
    variants: weightLadder(43),
  },
  {
    sku: 'VEG-GREENCUCUMBER',
    en: 'Green Cucumber',
    mr: 'ग्रीन काकडी',
    hi: 'हरा खीरा',
    category: 'vegetables',
    image: IMG('veg-green-cucumber'),
    unitType: UnitType.G,
    tags: ['hydrating', 'low-calorie'],
    aliases: ['green cucumber', 'green kakdi', 'हिरवी काकडी'],
    variants: weightLadder(38),
  },
];

async function main() {
  const actor = await db.user.findFirst({
    where: { role: { in: ['STORE_ADMIN', 'SUPER_ADMIN'] } },
    select: { id: true },
  });
  if (!actor) throw new Error('No admin/super-admin user found to attribute this write to');

  const categories = await db.category.findMany({
    where: { slug: { in: ['vegetables', 'fruits'] } },
    select: { id: true, slug: true },
  });
  const categoryId = Object.fromEntries(categories.map((c) => [c.slug, c.id])) as Record<
    'vegetables' | 'fruits',
    string
  >;

  for (const spec of SPECS) {
    const created = await createProduct(
      {
        sku: spec.sku,
        nameEn: spec.en,
        nameMr: spec.mr,
        nameHi: spec.hi,
        categoryId: categoryId[spec.category],
        unitType: spec.unitType,
        tags: spec.tags,
        imageUrls: [spec.image],
        isMealPlanEligible: true,
        isActive: true,
      },
      actor.id,
      null,
    );

    if (!created.ok) {
      console.log(`SKIP ${spec.sku}: ${created.reason}`);
      continue;
    }

    for (const variant of spec.variants) {
      await upsertVariant(created.productId, null, variant, actor.id, null);
    }

    for (const alias of spec.aliases) {
      await addAlias(created.productId, alias, 'mr', actor.id, null);
    }

    console.log(`OK ${spec.sku} -> ${created.productId}`);
  }

  console.log('\nDone.');
}

main()
  .catch((error) => {
    console.error('ERR', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
