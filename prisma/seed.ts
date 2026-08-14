/**
 * Planeat seed.
 *
 * Every phase extends this file so the build stays demoable with realistic
 * Indian grocery data: real Marathi vegetable names, real category structure,
 * realistic Maharashtra market prices in paise.
 *
 * Idempotent by construction — every write is an upsert on a natural key, so
 * running `npm run db:seed` twice changes nothing (R5 in spirit).
 *
 * Run with:  npm run db:seed
 */

import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { UnitType, UserRole, Locale, VehicleType } from '../src/generated/prisma/client';
import { db } from '../src/lib/db';
import { ID_PREFIX, newId } from '../src/lib/ids';
import { SETTING_GROUPS, bootstrapSettings } from '../src/lib/settings';
import { ALIAS_COUNT, PRODUCT_ALIASES } from './aliases';

// SKU -> Cloudinary URL, written by `scripts/upload-catalogue-images.mjs`.
const cloudinaryMap: Record<string, string> = (() => {
  try {
    return JSON.parse(readFileSync('public/products/cloudinary-map.json', 'utf-8'));
  } catch {
    return {};
  }
})();

// ─────────────────────────────────────────────────────────────
// Catalogue data
// ─────────────────────────────────────────────────────────────

interface VariantSeed {
  label: string;
  quantity: number;
  unit: UnitType;
  /** Market price in rupees; converted to paise on write. */
  price: number;
  mrp: number;
  stock: number;
  isDefault?: boolean;
}

interface ProductSeed {
  sku: string;
  en: string;
  mr: string;
  hi: string;
  unitType: UnitType;
  tags: string[];
  /** B13 — only Vegetables and Fruits are meal-plan eligible. */
  mealPlanEligible?: boolean;
  /** Client-requested culinary grouping, Vegetables only — see VEGETABLE_TYPES in vegetable-types.ts. */
  vegetableType?: string;
  aliases: string[];
  variants: VariantSeed[];
}

interface CategorySeed {
  slug: string;
  en: string;
  mr: string;
  hi: string;
  sortOrder: number;
  mealPlanEligible: boolean;
  products: ProductSeed[];
}

/** A 250 g / 500 g / 1 kg ladder — how vegetables are actually sold here. */
function weightLadder(pricePerKg: number, stock = 40): VariantSeed[] {
  const half = Math.round(pricePerKg / 2);
  const quarter = Math.round(pricePerKg / 4);
  return [
    { label: '250 g', quantity: 250, unit: UnitType.G, price: quarter, mrp: quarter + 2, stock },
    {
      label: '500 g',
      quantity: 500,
      unit: UnitType.G,
      price: half,
      mrp: half + 4,
      stock,
      isDefault: true,
    },
    {
      label: '1 kg',
      quantity: 1000,
      unit: UnitType.G,
      price: pricePerKg,
      mrp: pricePerKg + 8,
      stock,
    },
  ];
}

function bunch(price: number, stock = 30): VariantSeed[] {
  return [
    {
      label: '1 जुडी',
      quantity: 1,
      unit: UnitType.BUNCH,
      price,
      mrp: price + 3,
      stock,
      isDefault: true,
    },
  ];
}

function pack(label: string, quantity: number, unit: UnitType, price: number, mrp: number, stock = 25): VariantSeed[] {
  return [{ label, quantity, unit, price, mrp, stock, isDefault: true }];
}

const CATEGORIES: CategorySeed[] = [
  {
    slug: 'vegetables',
    en: 'Vegetables',
    mr: 'भाजीपाला',
    hi: 'सब्ज़ियाँ',
    sortOrder: 1,
    mealPlanEligible: true,
    products: [
      {
        sku: 'VEG-ONION',
        en: 'Onion',
        mr: 'कांदा',
        hi: 'प्याज',
        unitType: UnitType.G,
        vegetableType: 'bulb',
        tags: ['staple', 'allium', 'quercetin'],
        aliases: ['kanda', 'onion', 'pyaj', 'प्याज', 'कांदे'],
        variants: weightLadder(32),
      },
      {
        sku: 'VEG-TOMATO',
        en: 'Tomato',
        mr: 'टोमॅटो',
        hi: 'टमाटर',
        unitType: UnitType.G,
        vegetableType: 'fruit',
        tags: ['staple', 'vitamin-c', 'lycopene'],
        aliases: ['tomato', 'tamatar', 'टमाटर', 'टोमेटो'],
        variants: weightLadder(40),
      },
      {
        sku: 'VEG-POTATO',
        en: 'Potato',
        mr: 'बटाटा',
        hi: 'आलू',
        unitType: UnitType.G,
        vegetableType: 'tuber',
        tags: ['staple', 'starchy', 'root'],
        aliases: ['batata', 'potato', 'aloo', 'आलू', 'बटाटे'],
        variants: weightLadder(35),
      },
      {
        sku: 'VEG-BRINJAL',
        en: 'Brinjal',
        mr: 'वांगी',
        hi: 'बैंगन',
        unitType: UnitType.G,
        vegetableType: 'fruit',
        // Brinjal allergy is uncommon but real, and it is the vegetable people
        // most often name when asked what they react to.
        tags: ['fibre', 'low-calorie', 'allergen:brinjal'],
        aliases: ['vangi', 'brinjal', 'baingan', 'eggplant', 'बैंगन'],
        variants: weightLadder(45),
      },
      {
        sku: 'VEG-OKRA',
        en: 'Lady Finger',
        mr: 'भेंडी',
        hi: 'भिंडी',
        unitType: UnitType.G,
        vegetableType: 'fruit',
        tags: ['fibre', 'folate', 'diabetes-friendly'],
        aliases: ['bhendi', 'bhindi', 'okra', 'lady finger', 'भिंडी'],
        variants: weightLadder(55),
      },
      {
        sku: 'VEG-BOTTLEGOURD',
        en: 'Bottle Gourd',
        mr: 'दुधी भोपळा',
        hi: 'लौकी',
        unitType: UnitType.G,
        vegetableType: 'fruit',
        tags: ['hydrating', 'low-calorie', 'kidney-friendly'],
        aliases: ['dudhi', 'lauki', 'bottle gourd', 'ghiya', 'लौकी'],
        variants: weightLadder(35),
      },
      {
        sku: 'VEG-RIDGEGOURD',
        en: 'Ridge Gourd',
        mr: 'दोडका',
        hi: 'तोरई',
        unitType: UnitType.G,
        vegetableType: 'fruit',
        tags: ['low-calorie', 'fibre'],
        aliases: ['dodka', 'turai', 'torai', 'ridge gourd', 'तोरई'],
        variants: weightLadder(50),
      },
      {
        sku: 'VEG-CLUSTERBEANS',
        en: 'Cluster Beans',
        mr: 'गवार',
        hi: 'ग्वार फली',
        unitType: UnitType.G,
        vegetableType: 'pod',
        tags: ['fibre', 'diabetes-friendly', 'protein'],
        aliases: ['gawar', 'guar', 'cluster beans', 'gvar', 'ग्वार'],
        variants: weightLadder(60),
      },
      {
        sku: 'VEG-FENUGREEK',
        en: 'Fenugreek Leaves',
        mr: 'मेथी',
        hi: 'मेथी',
        unitType: UnitType.BUNCH,
        vegetableType: 'leafy',
        tags: ['iron', 'leafy', 'diabetes-friendly'],
        aliases: ['methi', 'fenugreek', 'methi bhaji', 'मेथी'],
        variants: bunch(20),
      },
      {
        // Fresh groundnuts are a genuine Maharashtra vegetable-market item in
        // season — and they are what makes S4's allergen block testable
        // against the real catalogue rather than only in a unit test.
        sku: 'VEG-FRESHPEANUT',
        en: 'Fresh Groundnuts',
        mr: 'ओले शेंगदाणे',
        hi: 'ताज़ी मूंगफली',
        unitType: UnitType.G,
        vegetableType: 'pod',
        tags: ['protein', 'energy', 'allergen:peanut'],
        aliases: ['ole shengdane', 'shengdane', 'fresh groundnut', 'mungfali', 'शेंगदाणे', 'मूंगफली'],
        variants: weightLadder(90, 20),
      },
      {
        sku: 'VEG-SPINACH',
        en: 'Spinach',
        mr: 'पालक',
        hi: 'पालक',
        unitType: UnitType.BUNCH,
        vegetableType: 'leafy',
        tags: ['iron', 'leafy', 'anaemia'],
        aliases: ['palak', 'spinach', 'पालक'],
        variants: bunch(18),
      },
      {
        sku: 'VEG-CORIANDER',
        en: 'Coriander',
        mr: 'कोथिंबीर',
        hi: 'धनिया',
        unitType: UnitType.BUNCH,
        vegetableType: 'leafy',
        tags: ['herb', 'garnish'],
        aliases: ['kothimbir', 'dhania', 'coriander', 'cilantro', 'धनिया'],
        variants: bunch(15),
      },
      {
        sku: 'VEG-CURRYLEAVES',
        en: 'Curry Leaves',
        mr: 'कढीपत्ता',
        hi: 'करी पत्ता',
        unitType: UnitType.BUNCH,
        vegetableType: 'leafy',
        tags: ['herb', 'tempering'],
        aliases: ['kadipatta', 'curry leaves', 'kadi patta', 'करी पत्ता'],
        variants: bunch(10),
      },
      {
        sku: 'VEG-CABBAGE',
        en: 'Cabbage',
        mr: 'कोबी',
        hi: 'पत्ता गोभी',
        unitType: UnitType.G,
        vegetableType: 'flower',
        tags: ['fibre', 'vitamin-c'],
        aliases: ['kobi', 'cabbage', 'patta gobhi', 'गोभी'],
        variants: weightLadder(30),
      },
      {
        sku: 'VEG-CAULIFLOWER',
        en: 'Cauliflower',
        mr: 'फ्लॉवर',
        hi: 'फूल गोभी',
        unitType: UnitType.G,
        vegetableType: 'flower',
        tags: ['fibre', 'vitamin-c'],
        aliases: ['flower', 'cauliflower', 'phool gobhi', 'गोभी'],
        variants: weightLadder(40),
      },
      {
        sku: 'VEG-CARROT',
        en: 'Carrot',
        mr: 'गाजर',
        hi: 'गाजर',
        unitType: UnitType.G,
        vegetableType: 'root',
        tags: ['vitamin-a', 'beta-carotene', 'root'],
        aliases: ['gajar', 'carrot', 'गाजर'],
        variants: weightLadder(50),
      },
      {
        sku: 'VEG-GREENCHILLI',
        en: 'Green Chilli',
        mr: 'हिरवी मिरची',
        hi: 'हरी मिर्च',
        unitType: UnitType.G,
        vegetableType: 'fruit',
        tags: ['spice', 'vitamin-c'],
        aliases: ['mirchi', 'hirvi mirchi', 'green chilli', 'hari mirch', 'मिर्च'],
        variants: [
          { label: '100 g', quantity: 100, unit: UnitType.G, price: 8, mrp: 10, stock: 40, isDefault: true },
          { label: '250 g', quantity: 250, unit: UnitType.G, price: 20, mrp: 24, stock: 40 },
        ],
      },
      {
        sku: 'VEG-GINGER',
        en: 'Ginger',
        mr: 'आले',
        hi: 'अदरक',
        unitType: UnitType.G,
        vegetableType: 'root',
        tags: ['spice', 'digestion', 'anti-inflammatory', 'root'],
        aliases: ['ale', 'adrak', 'ginger', 'अदरक'],
        variants: [
          { label: '100 g', quantity: 100, unit: UnitType.G, price: 12, mrp: 15, stock: 30, isDefault: true },
          { label: '250 g', quantity: 250, unit: UnitType.G, price: 30, mrp: 34, stock: 30 },
        ],
      },
      {
        sku: 'VEG-GARLIC',
        en: 'Garlic',
        mr: 'लसूण',
        hi: 'लहसुन',
        unitType: UnitType.G,
        vegetableType: 'bulb',
        tags: ['allium', 'cholesterol', 'root'],
        aliases: ['lasun', 'lehsun', 'garlic', 'लहसुन'],
        variants: [
          { label: '100 g', quantity: 100, unit: UnitType.G, price: 15, mrp: 18, stock: 30, isDefault: true },
          { label: '250 g', quantity: 250, unit: UnitType.G, price: 38, mrp: 42, stock: 30 },
        ],
      },
      {
        sku: 'VEG-PUMPKIN',
        en: 'Red Pumpkin',
        mr: 'लाल भोपळा',
        hi: 'कद्दू',
        unitType: UnitType.G,
        vegetableType: 'fruit',
        tags: ['vitamin-a', 'low-calorie'],
        aliases: ['bhopla', 'kaddu', 'pumpkin', 'कद्दू'],
        variants: weightLadder(30),
      },
      {
        sku: 'VEG-BEETROOT',
        en: 'Beetroot',
        mr: 'बीट',
        hi: 'चुकंदर',
        unitType: UnitType.G,
        vegetableType: 'root',
        tags: ['iron', 'anaemia', 'folate', 'root'],
        aliases: ['beet', 'chukandar', 'beetroot', 'चुकंदर'],
        variants: weightLadder(45),
      },
      {
        sku: 'VEG-CAPSICUM',
        en: 'Capsicum',
        mr: 'ढोबळी मिरची',
        hi: 'शिमला मिर्च',
        unitType: UnitType.G,
        vegetableType: 'fruit',
        tags: ['vitamin-c'],
        aliases: ['dhobli mirchi', 'shimla mirch', 'capsicum', 'bell pepper'],
        variants: weightLadder(70),
      },
      {
        sku: 'VEG-CUCUMBER',
        en: 'Cucumber',
        mr: 'काकडी',
        hi: 'खीरा',
        unitType: UnitType.G,
        vegetableType: 'fruit',
        tags: ['hydrating', 'low-calorie'],
        aliases: ['kakdi', 'kheera', 'cucumber', 'खीरा'],
        variants: weightLadder(40),
      },
    ],
  },
  {
    slug: 'fruits',
    en: 'Fruits',
    mr: 'फळे',
    hi: 'फल',
    sortOrder: 2,
    mealPlanEligible: true,
    products: [
      {
        sku: 'FRT-BANANA',
        en: 'Banana',
        mr: 'केळी',
        hi: 'केला',
        unitType: UnitType.PIECE,
        tags: ['potassium', 'energy'],
        aliases: ['keli', 'kela', 'banana', 'केला'],
        variants: [
          { label: '6 नग', quantity: 6, unit: UnitType.PIECE, price: 26, mrp: 30, stock: 50, isDefault: true },
          { label: '1 डझन', quantity: 12, unit: UnitType.PIECE, price: 50, mrp: 56, stock: 50 },
        ],
      },
      {
        sku: 'FRT-APPLE',
        en: 'Apple',
        mr: 'सफरचंद',
        hi: 'सेब',
        unitType: UnitType.G,
        tags: ['fibre', 'vitamin-c'],
        aliases: ['safarchand', 'seb', 'apple', 'सेब'],
        variants: weightLadder(180, 20),
      },
      {
        sku: 'FRT-MOSAMBI',
        en: 'Sweet Lime',
        mr: 'मोसंबी',
        hi: 'मौसंबी',
        unitType: UnitType.G,
        tags: ['vitamin-c', 'hydrating'],
        aliases: ['mosambi', 'sweet lime', 'mausambi', 'मौसंबी'],
        variants: weightLadder(70, 25),
      },
      {
        sku: 'FRT-PAPAYA',
        en: 'Papaya',
        mr: 'पपई',
        hi: 'पपीता',
        unitType: UnitType.G,
        tags: ['digestion', 'vitamin-a'],
        aliases: ['papai', 'papita', 'papaya', 'पपीता'],
        variants: weightLadder(40, 20),
      },
      {
        sku: 'FRT-POMEGRANATE',
        en: 'Pomegranate',
        mr: 'डाळिंब',
        hi: 'अनार',
        unitType: UnitType.G,
        tags: ['iron', 'anaemia', 'antioxidant'],
        aliases: ['dalimb', 'anar', 'pomegranate', 'अनार'],
        variants: weightLadder(140, 20),
      },
      {
        sku: 'FRT-LEMON',
        en: 'Lemon',
        mr: 'लिंबू',
        hi: 'नींबू',
        unitType: UnitType.PIECE,
        tags: ['vitamin-c', 'garnish'],
        aliases: ['limbu', 'nimbu', 'lemon', 'नींबू'],
        variants: [
          { label: '4 नग', quantity: 4, unit: UnitType.PIECE, price: 20, mrp: 24, stock: 40, isDefault: true },
        ],
      },
    ],
  },
  {
    slug: 'dairy',
    en: 'Dairy',
    mr: 'दूध व दुग्धजन्य',
    hi: 'दूध और डेयरी',
    sortOrder: 3,
    mealPlanEligible: false,
    products: [
      {
        sku: 'DRY-MILK-500',
        en: 'Toned Milk',
        mr: 'दूध',
        hi: 'दूध',
        unitType: UnitType.ML,
        tags: ['dairy', 'protein', 'allergen:milk'],
        aliases: ['dudh', 'milk', 'दूध'],
        variants: pack('500 ml', 500, UnitType.ML, 28, 30, 60),
      },
      {
        sku: 'DRY-CURD-400',
        en: 'Curd',
        mr: 'दही',
        hi: 'दही',
        unitType: UnitType.G,
        tags: ['dairy', 'probiotic', 'allergen:milk'],
        aliases: ['dahi', 'curd', 'yogurt', 'दही'],
        variants: pack('400 g', 400, UnitType.G, 35, 40, 40),
      },
      {
        sku: 'DRY-PANEER-200',
        en: 'Paneer',
        mr: 'पनीर',
        hi: 'पनीर',
        unitType: UnitType.G,
        tags: ['dairy', 'protein', 'allergen:milk'],
        aliases: ['paneer', 'cottage cheese', 'पनीर'],
        variants: pack('200 g', 200, UnitType.G, 95, 105, 20),
      },
      {
        sku: 'DRY-GHEE-500',
        en: 'Cow Ghee',
        mr: 'तूप',
        hi: 'घी',
        unitType: UnitType.ML,
        tags: ['dairy', 'fat', 'allergen:milk'],
        aliases: ['tup', 'ghee', 'घी'],
        variants: pack('500 ml', 500, UnitType.ML, 340, 375, 15),
      },
    ],
  },
  {
    slug: 'bakery-biscuits',
    en: 'Bakery & Biscuits',
    mr: 'बेकरी व बिस्किटे',
    hi: 'बेकरी और बिस्कुट',
    sortOrder: 4,
    mealPlanEligible: false,
    products: [
      {
        sku: 'BKY-BREAD-400',
        en: 'Whole Wheat Bread',
        mr: 'गव्हाचा ब्रेड',
        hi: 'गेहूँ की ब्रेड',
        unitType: UnitType.G,
        tags: ['bakery', 'allergen:gluten'],
        aliases: ['bread', 'pav bread', 'ब्रेड'],
        variants: pack('400 g', 400, UnitType.G, 45, 50, 25),
      },
      {
        sku: 'BKY-PAV-6',
        en: 'Ladi Pav',
        mr: 'लादी पाव',
        hi: 'लादी पाव',
        unitType: UnitType.PIECE,
        tags: ['bakery', 'allergen:gluten'],
        aliases: ['pav', 'ladi pav', 'पाव'],
        variants: pack('6 नग', 6, UnitType.PIECE, 25, 28, 30),
      },
      {
        sku: 'BKY-MARIE-250',
        en: 'Marie Biscuits',
        mr: 'मारी बिस्किटे',
        hi: 'मारी बिस्कुट',
        unitType: UnitType.G,
        tags: ['biscuit', 'allergen:gluten', 'allergen:milk'],
        aliases: ['marie', 'biscuit', 'बिस्किट'],
        variants: pack('250 g', 250, UnitType.G, 40, 45, 40),
      },
    ],
  },
  {
    slug: 'ice-cream',
    en: 'Ice Cream',
    mr: 'आइस्क्रीम',
    hi: 'आइसक्रीम',
    sortOrder: 5,
    mealPlanEligible: false,
    products: [
      {
        sku: 'ICE-VANILLA-700',
        en: 'Vanilla Ice Cream',
        mr: 'व्हॅनिला आइस्क्रीम',
        hi: 'वनीला आइसक्रीम',
        unitType: UnitType.ML,
        tags: ['dessert', 'allergen:milk'],
        aliases: ['vanilla', 'ice cream', 'आइसक्रीम'],
        variants: pack('700 ml', 700, UnitType.ML, 185, 210, 15),
      },
      {
        sku: 'ICE-KULFI-4',
        en: 'Malai Kulfi',
        mr: 'मलई कुल्फी',
        hi: 'मलाई कुल्फी',
        unitType: UnitType.PIECE,
        tags: ['dessert', 'allergen:milk'],
        aliases: ['kulfi', 'malai kulfi', 'कुल्फी'],
        variants: pack('4 नग', 4, UnitType.PIECE, 90, 100, 20),
      },
    ],
  },
  {
    slug: 'grocery',
    en: 'Grocery',
    mr: 'किराणा',
    hi: 'किराना',
    sortOrder: 6,
    mealPlanEligible: false,
    products: [
      {
        sku: 'GRC-RICE-5KG',
        en: 'Sona Masoori Rice',
        mr: 'तांदूळ',
        hi: 'चावल',
        unitType: UnitType.G,
        tags: ['staple', 'grain'],
        aliases: ['tandul', 'chawal', 'rice', 'चावल'],
        variants: pack('5 kg', 5000, UnitType.G, 380, 420, 20),
      },
      {
        sku: 'GRC-OIL-1L',
        en: 'Sunflower Oil',
        mr: 'सूर्यफूल तेल',
        hi: 'सूरजमुखी तेल',
        unitType: UnitType.ML,
        tags: ['oil'],
        aliases: ['tel', 'oil', 'sunflower oil', 'तेल'],
        variants: pack('1 L', 1000, UnitType.ML, 145, 160, 25),
      },
      {
        sku: 'GRC-TEA-250',
        en: 'Tea Powder',
        mr: 'चहा पावडर',
        hi: 'चाय पत्ती',
        unitType: UnitType.G,
        tags: ['beverage'],
        aliases: ['chaha', 'chai patti', 'tea', 'चाय'],
        variants: pack('250 g', 250, UnitType.G, 140, 155, 30),
      },
      {
        sku: 'GRC-SUGAR-1KG',
        en: 'Sugar',
        mr: 'साखर',
        hi: 'चीनी',
        unitType: UnitType.G,
        tags: ['staple'],
        aliases: ['sakhar', 'chini', 'sugar', 'चीनी'],
        variants: pack('1 kg', 1000, UnitType.G, 48, 52, 40),
      },
      {
        sku: 'GRC-TOORDAL-1KG',
        en: 'Toor Dal',
        mr: 'तूर डाळ',
        hi: 'तूर दाल',
        unitType: UnitType.G,
        tags: ['pulse', 'protein'],
        aliases: ['toor dal', 'tur dal', 'arhar', 'डाळ', 'दाल'],
        variants: pack('1 kg', 1000, UnitType.G, 165, 180, 30),
      },
      {
        sku: 'GRC-ATTA-5KG',
        en: 'Whole Wheat Atta',
        mr: 'गव्हाचे पीठ',
        hi: 'गेहूँ का आटा',
        unitType: UnitType.G,
        tags: ['staple', 'grain'],
        aliases: ['atta', 'gahu peeth', 'wheat flour', 'आटा'],
        variants: pack('5 kg', 5000, UnitType.G, 235, 260, 20),
      },
    ],
  },
];

/**
 * B11 — pincode allow-list AND a radius from the area's centre; both must
 * pass. Nashik is the actual target market; the four Ahilyanagar villages
 * below were the original bootstrap placeholders and stay only because
 * delivery-partner demo accounts are already linked to them.
 *
 * Nashik's pincodes are all centred on roughly the same city-centre
 * coordinate with a wide 15 km radius — accurate per-locality lat/lng isn't
 * worth chasing for a demo when one generous radius covers the whole city.
 */
const NASHIK_CENTER = { lat: 19.9975, lng: 73.7898 };
const SERVICE_AREAS = [
  { name: 'Pathardi', pincode: '414102', lat: 19.1739, lng: 75.1817, radius: 8000 },
  { name: 'Mirajgaon', pincode: '414103', lat: 19.0242, lng: 75.1005, radius: 8000 },
  { name: 'Shevgaon', pincode: '414502', lat: 19.3494, lng: 75.2296, radius: 8000 },
  { name: 'Tisgaon', pincode: '414105', lat: 19.2201, lng: 75.0894, radius: 8000 },
  { name: 'Nashik (GPO)', pincode: '422001', ...NASHIK_CENTER, radius: 15000 },
  { name: 'Panchavati', pincode: '422003', ...NASHIK_CENTER, radius: 15000 },
  { name: 'College Road', pincode: '422005', ...NASHIK_CENTER, radius: 15000 },
  { name: 'Satpur', pincode: '422007', ...NASHIK_CENTER, radius: 15000 },
  { name: 'CIDCO', pincode: '422008', ...NASHIK_CENTER, radius: 15000 },
  { name: 'Indira Nagar', pincode: '422009', ...NASHIK_CENTER, radius: 15000 },
  { name: 'Gangapur Road', pincode: '422013', ...NASHIK_CENTER, radius: 15000 },
  { name: 'Nashik Road', pincode: '422101', ...NASHIK_CENTER, radius: 15000 },
];

// ─────────────────────────────────────────────────────────────
// Seeders
// ─────────────────────────────────────────────────────────────

async function seedSettings(): Promise<void> {
  const values = bootstrapSettings();
  for (const [key, value] of Object.entries(values)) {
    await db.appSetting.upsert({
      where: { key },
      create: {
        key,
        value: value as never,
        group: SETTING_GROUPS[key as keyof typeof SETTING_GROUPS] ?? 'general',
      },
      update: {}, // Never clobber a value the admin has already tuned (R8).
    });
  }
  console.info(`  app_settings: ${Object.keys(values).length} keys`);
}

async function seedServiceAreas(): Promise<void> {
  for (const area of SERVICE_AREAS) {
    await db.serviceArea.upsert({
      where: { pincode: area.pincode },
      create: {
        id: newId(ID_PREFIX.serviceArea),
        name: area.name,
        pincode: area.pincode,
        centerLat: area.lat,
        centerLng: area.lng,
        radiusMeters: area.radius,
        deliveryFeePaise: 2500n,
        freeDeliveryThresholdPaise: 29900n,
        slotsJson: {
          instant: ['EXPRESS', 'MORNING_7_9', 'EVENING_5_7'],
          subscription: ['SUBSCRIPTION_0630_0900'],
        },
      },
      update: {
        name: area.name,
        centerLat: area.lat,
        centerLng: area.lng,
        radiusMeters: area.radius,
      },
    });
  }
  console.info(`  service_areas: ${SERVICE_AREAS.length}`);
}

async function seedCatalogue(): Promise<void> {
  let productCount = 0;
  let variantCount = 0;
  let aliasCount = 0;

  for (const category of CATEGORIES) {
    const cat = await db.category.upsert({
      where: { slug: category.slug },
      create: {
        id: newId(ID_PREFIX.category),
        slug: category.slug,
        nameEn: category.en,
        nameMr: category.mr,
        nameHi: category.hi,
        sortOrder: category.sortOrder,
      },
      update: {
        nameEn: category.en,
        nameMr: category.mr,
        nameHi: category.hi,
        sortOrder: category.sortOrder,
      },
    });

    for (const [index, product] of category.products.entries()) {
      // B13 — meal-plan eligibility is a property of the category, applied to
      // every product in it. Nothing outside Vegetables and Fruits is eligible.
      const eligible = product.mealPlanEligible ?? category.mealPlanEligible;

      const searchKeywords = [product.en, product.mr, product.hi, ...product.aliases]
        .join(' ')
        .toLowerCase();

      // Freely-licensed photos fetched from Wikimedia Commons by
      // `scripts/fetch-product-images.mjs` — see `public/products/ATTRIBUTION.md`.
      // Demo catalogue assets: the owner replaces them with real stock photos
      // from the admin panel once the store has its own. Mirrored onto
      // Cloudinary by `scripts/upload-catalogue-images.mjs`; falls back to the
      // local file if a SKU is missing from the map.
      const imageUrls = [cloudinaryMap[product.sku] ?? `/products/${product.sku}.jpg`];

      const prd = await db.product.upsert({
        where: { sku: product.sku },
        create: {
          id: newId(ID_PREFIX.product),
          categoryId: cat.id,
          sku: product.sku,
          nameEn: product.en,
          nameMr: product.mr,
          nameHi: product.hi,
          imageUrls,
          unitType: product.unitType,
          tags: product.tags,
          vegetableType: product.vegetableType ?? null,
          isMealPlanEligible: eligible,
          searchKeywords,
          sortOrder: index,
        },
        update: {
          categoryId: cat.id,
          nameEn: product.en,
          nameMr: product.mr,
          nameHi: product.hi,
          imageUrls,
          tags: product.tags,
          vegetableType: product.vegetableType ?? null,
          isMealPlanEligible: eligible,
          searchKeywords,
          sortOrder: index,
        },
      });
      productCount += 1;

      for (const variant of product.variants) {
        const existing = await db.productVariant.findFirst({
          where: { productId: prd.id, label: variant.label },
          select: { id: true },
        });

        const data = {
          label: variant.label,
          quantity: variant.quantity,
          unit: variant.unit,
          // R4 — rupees never reach the database; only integer paise do.
          mrpPaise: BigInt(variant.mrp * 100),
          pricePaise: BigInt(variant.price * 100),
          stockQty: variant.stock,
          lowStockThreshold: 5,
          isDefault: variant.isDefault ?? product.variants.length === 1,
        };

        if (existing) {
          await db.productVariant.update({ where: { id: existing.id }, data });
        } else {
          await db.productVariant.create({
            data: { id: newId(ID_PREFIX.variant), productId: prd.id, ...data },
          });
        }
        variantCount += 1;
      }

      // M2 — search must find कांदा, `kanda` and `onion` as one product.
      // M4 — the Smart List's alias dictionary, 200+ terms strong. Regional
      // variants, plurals and the Latin spellings a phone keyboard actually
      // produces all live in `aliases.ts`; this merges them with the short
      // list defined alongside each product above.
      const allAliases = [...new Set([...product.aliases, ...(PRODUCT_ALIASES[product.sku] ?? [])])];

      for (const alias of allAliases) {
        const locale = /[ऀ-ॿ]/.test(alias) ? Locale.mr : Locale.en;
        await db.productAlias.upsert({
          where: { productId_alias_locale: { productId: prd.id, alias, locale } },
          create: { id: newId(ID_PREFIX.alias), productId: prd.id, alias, locale },
          update: {},
        });
        aliasCount += 1;
      }
    }
  }

  console.info(`  categories: ${CATEGORIES.length}`);
  console.info(`  products: ${productCount}`);
  console.info(`  variants: ${variantCount}`);
  console.info(`  aliases: ${aliasCount} (M4 dictionary contributes ${ALIAS_COUNT})`);
}

async function seedUsers(): Promise<void> {
  // A super admin so Phase 8's admin panel has somebody to log in as, and one
  // customer so later phases have a realistic account to demo against.
  await db.user.upsert({
    where: { phone: '9999900001' },
    create: {
      id: newId(ID_PREFIX.user),
      phone: '9999900001',
      name: 'Planeat Admin',
      role: UserRole.SUPER_ADMIN,
      preferredLanguage: Locale.mr,
    },
    update: { role: UserRole.SUPER_ADMIN },
  });

  await db.user.upsert({
    where: { phone: '9999900002' },
    create: {
      id: newId(ID_PREFIX.user),
      phone: '9999900002',
      name: 'सुनिता पवार',
      role: UserRole.CUSTOMER,
      preferredLanguage: Locale.mr,
    },
    update: {},
  });

  console.info('  users: 2 (super admin 9999900001, customer 9999900002)');
}

/** M10 — two riders so the assignment screen and the rider PWA both have somebody real. */
async function seedDeliveryPartners(): Promise<void> {
  const partners = [
    { phone: '9999900010', name: 'रमेश शिंदे', pincode: '414102' },
    { phone: '9999900011', name: 'सुरेश काळे', pincode: '414103' },
  ];

  for (const partner of partners) {
    const serviceArea = await db.serviceArea.findUnique({ where: { pincode: partner.pincode } });

    const user = await db.user.upsert({
      where: { phone: partner.phone },
      create: {
        id: newId(ID_PREFIX.user),
        phone: partner.phone,
        name: partner.name,
        role: UserRole.DELIVERY_PARTNER,
        preferredLanguage: Locale.mr,
      },
      update: { role: UserRole.DELIVERY_PARTNER },
    });

    await db.deliveryPartner.upsert({
      where: { userId: user.id },
      create: {
        id: newId(ID_PREFIX.deliveryPartner),
        userId: user.id,
        vehicleType: VehicleType.BIKE,
        isAvailable: true,
        serviceAreaId: serviceArea?.id ?? null,
      },
      update: {},
    });
  }

  console.info('  delivery_partners: 2 (9999900010, 9999900011)');
}

async function main(): Promise<void> {
  console.info('Seeding Planeat…');
  await seedSettings();
  await seedServiceAreas();
  await seedCatalogue();
  await seedUsers();
  await seedDeliveryPartners();
  console.info('Done.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
