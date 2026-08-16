/**
 * "Make My Meal Plan" — the free, common seasonal base plan (D-204). Static,
 * client-supplied reference content, not derived from `HealthProfile` or an
 * AI call: the whole point (per the terms screen) is that this is NOT
 * personalised, just a shared weekly template built from what's seasonally
 * available.
 *
 * Each cell currently holds exactly one option. The client's brief asks for
 * 2-3 selectable alternatives per cell ("various options") — only one has
 * been supplied per cell so far; more are a content addition, not a code
 * change, once provided. The picker UI below is already built for an array,
 * so adding options later is a data-only change to this file.
 */

export type LocalizedText = { mr: string; hi: string; en: string };

export interface PlanOption {
  id: string;
  label: LocalizedText;
}

export interface PlanDay {
  day: string; // matches the `mealPlan.days.*` i18n keys already in use
  sprouts: PlanOption[];
  fruits: PlanOption[];
  dairy: PlanOption[];
  extras: PlanOption[];
  mainMeal: PlanOption[];
}

function opt(id: string, mr: string, hi: string, en: string): PlanOption {
  return { id, label: { mr, hi, en } };
}

export const BASE_PLAN_TEMPLATE: PlanDay[] = [
  {
    day: '1',
    sprouts: [opt('matki', 'मटकी मोड', 'मोठ के अंकुर', 'Moth Bean Sprouts')],
    fruits: [opt('apple-banana', 'सफरचंद, केळी', 'सेब, केला', 'Apple, Banana')],
    dairy: [opt('milk-curd-buttermilk', 'दूध, दही, ताक', 'दूध, दही, छाछ', 'Milk, Curd, Buttermilk')],
    extras: [opt('coriander-curryleaf', 'कोथिंबीर, कढीपत्ता', 'धनिया, करी पत्ता', 'Coriander, Curry Leaves')],
    mainMeal: [
      opt(
        'mon-main',
        'पालक, टोमॅटो, भरीत वांगे, चवळी शेंगा',
        'पालक, टमाटर, भरता बैंगन, लोबिया की फली',
        'Spinach, Tomato, Brinjal (for bharit), Cowpea Beans',
      ),
    ],
  },
  {
    day: '2',
    sprouts: [opt('moong', 'मूंग मोड', 'मूंग के अंकुर', 'Moong Sprouts')],
    fruits: [opt('pomegranate', 'डाळींब', 'अनार', 'Pomegranate')],
    dairy: [opt('milk-curd-buttermilk', 'दूध, दही, ताक', 'दूध, दही, छाछ', 'Milk, Curd, Buttermilk')],
    extras: [
      opt('green-chili', 'हिरवी बारीक आणि जाड मिरची', 'हरी पतली और मोटी मिर्च', 'Thin & Thick Green Chillies'),
    ],
    mainMeal: [
      opt(
        'tue-main',
        'मेथी, फ्लॉवर, गिलके, चपटी वाल',
        'मेथी, फूलगोभी, तुरई, चपटी सेम',
        'Fenugreek Leaves, Cauliflower, Ridge Gourd, Flat Beans',
      ),
    ],
  },
  {
    day: '3',
    sprouts: [opt('harbhara', 'हरभरा मोड', 'चने के अंकुर', 'Chickpea Sprouts')],
    fruits: [opt('papaya', 'पपई', 'पपीता', 'Papaya')],
    dairy: [opt('milk-curd-buttermilk', 'दूध, दही, ताक', 'दूध, दही, छाछ', 'Milk, Curd, Buttermilk')],
    extras: [
      opt('carrot-lemon-capsicum', 'गाजर, लिंबू, शिमला मिरची', 'गाजर, नींबू, शिमला मिर्च', 'Carrot, Lemon, Capsicum'),
    ],
    mainMeal: [
      opt(
        'wed-main',
        'भेंडी, शेवगा, वाल शेंगा, गवार',
        'भिंडी, सहजन, सेम की फली, ग्वार फली',
        'Okra, Drumstick, Flat Beans, Cluster Beans',
      ),
    ],
  },
  {
    day: '4',
    sprouts: [opt('vatana', 'वाटाणा मोड', 'मटर के अंकुर', 'Green Pea Sprouts')],
    fruits: [
      opt(
        'dragonfruit-banana-coconut',
        'ड्रॅगन फ्रूट, केळी, नारळपाणी',
        'ड्रैगन फ्रूट, केला, नारियल पानी',
        'Dragon Fruit, Banana, Coconut Water',
      ),
    ],
    dairy: [
      opt(
        'milk-curd-buttermilk-shrikhand',
        'दूध, दही, ताक, श्रीखंड',
        'दूध, दही, छाछ, श्रीखंड',
        'Milk, Curd, Buttermilk, Shrikhand',
      ),
    ],
    extras: [
      opt(
        'ginger-garlic-onion-coriander-curryleaf',
        'आद्रक, लसुन, कांदे, कोथिंबीर, कढीपत्ता',
        'अदरक, लहसुन, प्याज़, धनिया, करी पत्ता',
        'Ginger, Garlic, Onion, Coriander, Curry Leaves',
      ),
    ],
    mainMeal: [
      opt(
        'thu-main',
        'तांदुळका, बटाटा, काशिफळ, कारले',
        'चौलाई, आलू, कद्दू, करेला',
        'Amaranth Leaves, Potato, Pumpkin, Bitter Gourd',
      ),
    ],
  },
  {
    day: '5',
    sprouts: [opt('chole', 'छोले मोड', 'छोले के अंकुर', 'Chole Sprouts')],
    fruits: [opt('chikoo-kiwi', 'चिकू, किवी', 'चीकू, कीवी', 'Chikoo (Sapota), Kiwi')],
    dairy: [opt('milk-curd-buttermilk', 'दूध, दही, ताक', 'दूध, दही, छाछ', 'Milk, Curd, Buttermilk')],
    extras: [opt('green-chili-cucumber', 'बारीक हिरवी मिरची, काकडी', 'पतली हरी मिर्च, खीरा', 'Thin Green Chilli, Cucumber')],
    mainMeal: [
      opt(
        'fri-main',
        'आंबट चुका, वाटाणा, दोडके, ब्रोकोली',
        'खट्टा चुका, मटर, तुरई, ब्रोकोली',
        'Sour Chuka Greens, Green Peas, Ridge Gourd, Broccoli',
      ),
    ],
  },
  {
    day: '6',
    sprouts: [opt('chawli', 'चवळी मोड', 'लोबिया के अंकुर', 'Cowpea Sprouts')],
    fruits: [opt('strawberry-guava', 'स्ट्रॉबेरी, पेरू', 'स्ट्रॉबेरी, अमरूद', 'Strawberry, Guava')],
    dairy: [opt('milk-curd-buttermilk', 'दूध, दही, ताक', 'दूध, दही, छाछ', 'Milk, Curd, Buttermilk')],
    extras: [opt('lemon-beet', 'लिंबू, बीट', 'नींबू, चुकंदर', 'Lemon, Beetroot')],
    mainMeal: [
      opt(
        'sat-main',
        'धोळ, टोमॅटो, बिन्स, भरीत वांगी',
        'धोळ, टमाटर, बीन्स, भरता बैंगन',
        'Dhol Beans, Tomato, French Beans, Brinjal (for bharit)',
      ),
    ],
  },
  {
    day: '7',
    sprouts: [opt('pavta', 'पावटे मोड', 'पावटा के अंकुर', 'Field Bean Sprouts')],
    fruits: [opt('soybean-lychee', 'सोयाबीन, लिची', 'सोयाबीन, लीची', 'Soybean, Lychee')],
    dairy: [opt('milk-curd-buttermilk', 'दूध, दही, ताक', 'दूध, दही, छाछ', 'Milk, Curd, Buttermilk')],
    extras: [
      opt('thick-green-chili-coriander', 'जाड हिरवी मिरची, कोथिंबीर', 'मोटी हरी मिर्च, धनिया', 'Thick Green Chilli, Coriander'),
    ],
    mainMeal: [
      opt(
        'sun-main',
        'पोका, मशरूम, तोंडली, पत्ता कोबी',
        'पोका साग, मशरूम, तोंडली, पत्ता गोभी',
        'Poka Greens, Mushroom, Ivy Gourd (Tondli), Cabbage',
      ),
    ],
  },
];

export const PLAN_CATEGORIES = ['sprouts', 'fruits', 'dairy', 'extras', 'mainMeal'] as const;
export type PlanCategory = (typeof PLAN_CATEGORIES)[number];
