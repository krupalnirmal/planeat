import type { AppLocale } from '@/i18n/routing';

/**
 * Client-requested grouping for the Vegetables category page — a fixed list
 * rather than a free-text field so the page always renders these groups in
 * this order, and a typo in the seed data shows up as "ungrouped" instead of
 * a silent new group nobody asked for.
 */
export interface VegetableType {
  id: string;
  emoji: string;
  labelEn: string;
  labelMr: string;
  labelHi: string;
}

// Replaced (session 2026-09-19, client request, confirmed twice after being
// shown the consequence) from the earlier 10-way Leafy/Root/Tuber/Bulb/
// Stem/Fruit/Pod/Flower/Seed/Chopped split down to just these 2. Every
// existing product that isn't literally chopped now has no subgroup and
// falls into the page's existing "Other" bucket — accepted deliberately,
// not a bug. `organic` ships empty: nothing in the catalogue has real
// organic-certification data, so nothing gets tagged into it until a real
// organic SKU exists. `chopped` keeps its id from last session's 10 real
// chopped-vegetable products — only the label changed, so none of them
// needed re-tagging.
export const VEGETABLE_TYPES: VegetableType[] = [
  { id: 'organic', emoji: '🌿', labelEn: 'Organic Vegetable', labelMr: 'ऑरगॅनिक भाजी', labelHi: 'जैविक सब्ज़ी' },
  { id: 'chopped', emoji: '🔪', labelEn: 'Chopping Vegetable', labelMr: 'चिरलेली भाजी', labelHi: 'कटी हुई सब्ज़ी' },
];

export function vegetableTypeLabel(type: VegetableType, locale: AppLocale): string {
  if (locale === 'mr') return type.labelMr;
  if (locale === 'hi') return type.labelHi;
  return type.labelEn;
}

// Grocery's own sub-grouping (session 2026-08-25, Blinkit-matched sidebar
// rail extended beyond Vegetables). Reuses the same `vegetableType` column
// and shape — it is just a generic "sub-group id" per product, not
// vegetable-specific despite the field's name.
//
// Ice Cream is still deliberately left without a rail: at 2 products,
// splitting it further would put one item in most groups, which reads as
// broken rather than organised — a rail earns its keep only once a category
// has real breadth (Blinkit itself does not sub-group its own thin
// categories either). Dairy crossed that line in session 2026-08-26, Bakery
// & Biscuits in session 2026-08-29 (see DAIRY_TYPES / BAKERY_TYPES below).
export const GROCERY_TYPES: VegetableType[] = [
  { id: 'grains', emoji: '🌾', labelEn: 'Grains & Flour', labelMr: 'पीठ व धान्य', labelHi: 'आटा और अनाज' },
  { id: 'pulses', emoji: '🫘', labelEn: 'Pulses & Staples', labelMr: 'डाळी व इतर', labelHi: 'दाल और अन्य' },
  { id: 'pantry', emoji: '🫗', labelEn: 'Oil & Beverages', labelMr: 'तेल व पेय', labelHi: 'तेल और पेय' },
];

// Dairy's own sub-grouping (session 2026-08-26) — the category only had one
// product per kind (milk, curd, paneer, ghee), so a buttermilk, a flavoured
// yogurt, two cheese SKUs and a butter were added to the seed alongside this
// so every group has more than one item.
export const DAIRY_TYPES: VegetableType[] = [
  { id: 'milk', emoji: '🥛', labelEn: 'Milk & Buttermilk', labelMr: 'दूध व ताक', labelHi: 'दूध और छाछ' },
  { id: 'curd', emoji: '🥣', labelEn: 'Curd & Yogurt', labelMr: 'दही व योगर्ट', labelHi: 'दही और योगर्ट' },
  { id: 'paneer', emoji: '🧀', labelEn: 'Paneer & Cheese', labelMr: 'पनीर व चीज', labelHi: 'पनीर और चीज़' },
  { id: 'ghee', emoji: '🧈', labelEn: 'Ghee & Butter', labelMr: 'तूप व लोणी', labelHi: 'घी और मक्खन' },
];

// Replaced (session 2026-09-19, client request, same treatment/confirmation
// as VEGETABLE_TYPES above) from the earlier Citrus/Seasonal/Exotic/Dry
// Fruits split down to these 3. No existing fruit product gets proactively
// remapped into them — nothing in the catalogue has real import-sourcing
// or organic-certification data, so all 3 ship empty until real SKUs exist
// for each; every existing fruit falls into "Other" until then.
export const FRUIT_TYPES: VegetableType[] = [
  { id: 'fresh', emoji: '🍎', labelEn: 'Fresh Fruits', labelMr: 'ताजी फळे', labelHi: 'ताज़े फल' },
  { id: 'import', emoji: '🌍', labelEn: 'Import Fruits', labelMr: 'आयात केलेली फळे', labelHi: 'आयातित फल' },
  { id: 'organic', emoji: '🌿', labelEn: 'Organic Fruits', labelMr: 'ऑरगॅनिक फळे', labelHi: 'जैविक फल' },
];

// Bakery & Biscuits' own sub-grouping (session 2026-08-29) — the category
// only had 3 products (one bread, one pav, one biscuit), so a second bread,
// a burger bun, two more biscuits, a rusk and a cake were added to the seed
// alongside this so every group has more than one item, same reasoning as
// DAIRY_TYPES and FRUIT_TYPES above.
export const BAKERY_TYPES: VegetableType[] = [
  { id: 'bread', emoji: '🍞', labelEn: 'Bread & Buns', labelMr: 'ब्रेड व बन', labelHi: 'ब्रेड और बन' },
  { id: 'biscuits', emoji: '🍪', labelEn: 'Biscuits & Cookies', labelMr: 'बिस्किटे व कुकीज', labelHi: 'बिस्कुट और कुकीज़' },
  { id: 'cakes', emoji: '🍰', labelEn: 'Cakes & Rusk', labelMr: 'केक व रस्क', labelHi: 'केक और रस्क' },
];

// Aata's own sub-grouping (session 2026-09-19, new category, client's own
// list). `gahu` is populated immediately — the existing "Whole Wheat Atta"
// product moved here from the (storefront-inactive) Grocery category
// rather than being duplicated. `multigrain`/`jwari` are real new products
// with no existing photo to reuse, so they ship without one.
export const AATA_TYPES: VegetableType[] = [
  { id: 'multigrain', emoji: '🌾', labelEn: 'Multi Grain Aata', labelMr: 'मल्टी ग्रेन आटा', labelHi: 'मल्टी ग्रेन आटा' },
  { id: 'jwari', emoji: '🌾', labelEn: 'Jwari Aata', labelMr: 'ज्वारी आटा', labelHi: 'ज्वार आटा' },
  { id: 'gahu', emoji: '🌾', labelEn: 'Gahu Aata', labelMr: 'गहू आटा', labelHi: 'गेहूं आटा' },
];

// Masala's own sub-grouping (session 2026-09-19, new category, client's own
// list, "Trusted home-made" naming brands like Rajdevi/Udyogwardhini/
// Khandesi as examples). Ships with the real category + real subgroups but
// zero products — no legitimate source for those specific branded
// products' real prices/pack sizes/photos exists yet; inventing them would
// misrepresent real third-party commercial goods, not just a generic
// pricing judgment call. Populate once the client provides the actual
// product list, or via the admin catalogue directly.
export const MASALA_TYPES: VegetableType[] = [
  { id: 'packed', emoji: '🧂', labelEn: 'Packed Masala', labelMr: 'पॅक्ड मसाला', labelHi: 'पैक्ड मसाला' },
  {
    id: 'homemade',
    emoji: '🏺',
    labelEn: 'Trusted Home-made Masala',
    labelMr: 'विश्वासू घरगुती मसाला',
    labelHi: 'भरोसेमंद घर का मसाला',
  },
];

export const CATEGORY_SUBGROUPS: Record<string, VegetableType[]> = {
  vegetables: VEGETABLE_TYPES,
  fruits: FRUIT_TYPES,
  grocery: GROCERY_TYPES,
  dairy: DAIRY_TYPES,
  'bakery-biscuits': BAKERY_TYPES,
  aata: AATA_TYPES,
  masala: MASALA_TYPES,
};
