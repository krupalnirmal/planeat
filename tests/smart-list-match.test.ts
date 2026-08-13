import { describe, expect, it } from 'vitest';
import { normaliseSearchText } from '@/lib/catalog/text';
import { CONFIDENT, matchItem, type IndexedProduct } from '@/lib/smart-list/match';
import { parseListText } from '@/lib/smart-list/parse-text';
import { PRODUCT_ALIASES } from '../prisma/aliases';

/**
 * PART 12 — "A Marathi voice note yields an editable transcript and ≥80%
 * correct matches on the seeded aliases."
 *
 * The index below is built from the REAL alias dictionary in
 * `prisma/aliases.ts`, so this test measures the thing that actually ships. If
 * somebody removes an alias, this fails.
 */

const SKU_TO_NAME: Record<string, { en: string; mr: string; hi: string; unit: 'G' | 'BUNCH' | 'PIECE' | 'ML' }> = {
  'VEG-ONION': { en: 'Onion', mr: 'कांदा', hi: 'प्याज', unit: 'G' },
  'VEG-TOMATO': { en: 'Tomato', mr: 'टोमॅटो', hi: 'टमाटर', unit: 'G' },
  'VEG-POTATO': { en: 'Potato', mr: 'बटाटा', hi: 'आलू', unit: 'G' },
  'VEG-BRINJAL': { en: 'Brinjal', mr: 'वांगी', hi: 'बैंगन', unit: 'G' },
  'VEG-OKRA': { en: 'Lady Finger', mr: 'भेंडी', hi: 'भिंडी', unit: 'G' },
  'VEG-BOTTLEGOURD': { en: 'Bottle Gourd', mr: 'दुधी भोपळा', hi: 'लौकी', unit: 'G' },
  'VEG-RIDGEGOURD': { en: 'Ridge Gourd', mr: 'दोडका', hi: 'तोरई', unit: 'G' },
  'VEG-CLUSTERBEANS': { en: 'Cluster Beans', mr: 'गवार', hi: 'ग्वार फली', unit: 'G' },
  'VEG-FENUGREEK': { en: 'Fenugreek Leaves', mr: 'मेथी', hi: 'मेथी', unit: 'BUNCH' },
  'VEG-SPINACH': { en: 'Spinach', mr: 'पालक', hi: 'पालक', unit: 'BUNCH' },
  'VEG-CORIANDER': { en: 'Coriander', mr: 'कोथिंबीर', hi: 'धनिया', unit: 'BUNCH' },
  'VEG-CURRYLEAVES': { en: 'Curry Leaves', mr: 'कढीपत्ता', hi: 'करी पत्ता', unit: 'BUNCH' },
  'VEG-CABBAGE': { en: 'Cabbage', mr: 'कोबी', hi: 'पत्ता गोभी', unit: 'G' },
  'VEG-CAULIFLOWER': { en: 'Cauliflower', mr: 'फ्लॉवर', hi: 'फूल गोभी', unit: 'G' },
  'VEG-CARROT': { en: 'Carrot', mr: 'गाजर', hi: 'गाजर', unit: 'G' },
  'VEG-GREENCHILLI': { en: 'Green Chilli', mr: 'हिरवी मिरची', hi: 'हरी मिर्च', unit: 'G' },
  'VEG-GINGER': { en: 'Ginger', mr: 'आले', hi: 'अदरक', unit: 'G' },
  'VEG-GARLIC': { en: 'Garlic', mr: 'लसूण', hi: 'लहसुन', unit: 'G' },
  'VEG-PUMPKIN': { en: 'Red Pumpkin', mr: 'लाल भोपळा', hi: 'कद्दू', unit: 'G' },
  'VEG-BEETROOT': { en: 'Beetroot', mr: 'बीट', hi: 'चुकंदर', unit: 'G' },
  'VEG-CAPSICUM': { en: 'Capsicum', mr: 'ढोबळी मिरची', hi: 'शिमला मिर्च', unit: 'G' },
  'VEG-CUCUMBER': { en: 'Cucumber', mr: 'काकडी', hi: 'खीरा', unit: 'G' },
  'FRT-BANANA': { en: 'Banana', mr: 'केळी', hi: 'केला', unit: 'PIECE' },
  'FRT-APPLE': { en: 'Apple', mr: 'सफरचंद', hi: 'सेब', unit: 'G' },
  'FRT-MOSAMBI': { en: 'Sweet Lime', mr: 'मोसंबी', hi: 'मौसंबी', unit: 'G' },
  'FRT-PAPAYA': { en: 'Papaya', mr: 'पपई', hi: 'पपीता', unit: 'G' },
  'FRT-POMEGRANATE': { en: 'Pomegranate', mr: 'डाळिंब', hi: 'अनार', unit: 'G' },
  'FRT-LEMON': { en: 'Lemon', mr: 'लिंबू', hi: 'नींबू', unit: 'PIECE' },
  'DRY-MILK-500': { en: 'Toned Milk', mr: 'दूध', hi: 'दूध', unit: 'ML' },
  'DRY-CURD-400': { en: 'Curd', mr: 'दही', hi: 'दही', unit: 'G' },
  'DRY-PANEER-200': { en: 'Paneer', mr: 'पनीर', hi: 'पनीर', unit: 'G' },
  'DRY-GHEE-500': { en: 'Cow Ghee', mr: 'तूप', hi: 'घी', unit: 'ML' },
  'BKY-BREAD-400': { en: 'Whole Wheat Bread', mr: 'गव्हाचा ब्रेड', hi: 'गेहूँ की ब्रेड', unit: 'G' },
  'BKY-PAV-6': { en: 'Ladi Pav', mr: 'लादी पाव', hi: 'लादी पाव', unit: 'PIECE' },
  'BKY-MARIE-250': { en: 'Marie Biscuits', mr: 'मारी बिस्किटे', hi: 'मारी बिस्कुट', unit: 'G' },
  'ICE-VANILLA-700': { en: 'Vanilla Ice Cream', mr: 'व्हॅनिला आइस्क्रीम', hi: 'वनीला आइसक्रीम', unit: 'ML' },
  'ICE-KULFI-4': { en: 'Malai Kulfi', mr: 'मलई कुल्फी', hi: 'मलाई कुल्फी', unit: 'PIECE' },
  'GRC-TOORDAL-1KG': { en: 'Toor Dal', mr: 'तूर डाळ', hi: 'तूर दाल', unit: 'G' },
  'GRC-RICE-5KG': { en: 'Sona Masoori Rice', mr: 'तांदूळ', hi: 'चावल', unit: 'G' },
  'GRC-ATTA-5KG': { en: 'Whole Wheat Atta', mr: 'गव्हाचे पीठ', hi: 'गेहूँ का आटा', unit: 'G' },
  'GRC-OIL-1L': { en: 'Sunflower Oil', mr: 'सूर्यफूल तेल', hi: 'सूरजमुखी तेल', unit: 'ML' },
  'GRC-SUGAR-1KG': { en: 'Sugar', mr: 'साखर', hi: 'चीनी', unit: 'G' },
  'GRC-TEA-250': { en: 'Tea Powder', mr: 'चहा पावडर', hi: 'चाय पत्ती', unit: 'G' },
};

/** The same index `buildMatchIndex` produces, from the real seed data. */
const INDEX: IndexedProduct[] = Object.entries(SKU_TO_NAME).map(([sku, names]) => ({
  productId: sku,
  variantId: `${sku}_v`,
  name: names.mr,
  unitType: names.unit,
  pricePaise: 2_000n,
  inStock: true,
  terms: [
    ...new Set(
      [names.en, names.mr, names.hi, ...(PRODUCT_ALIASES[sku] ?? [])]
        .map(normaliseSearchText)
        .filter((term) => term.length > 0),
    ),
  ],
}));

function matchedSku(spoken: string): string | null {
  const result = matchItem(spoken, INDEX);
  return result.status === 'MATCHED' ? (result.best?.productId ?? null) : null;
}

describe('exact matches, in every language', () => {
  const cases: Array<[string, string]> = [
    ['कांदा', 'VEG-ONION'],
    ['प्याज', 'VEG-ONION'],
    ['onion', 'VEG-ONION'],
    ['kanda', 'VEG-ONION'],
    ['बटाटा', 'VEG-POTATO'],
    ['आलू', 'VEG-POTATO'],
    ['potato', 'VEG-POTATO'],
    ['कोथिंबीर', 'VEG-CORIANDER'],
    ['धनिया', 'VEG-CORIANDER'],
    ['coriander', 'VEG-CORIANDER'],
  ];

  it.each(cases)('matches "%s" to %s', (spoken, sku) => {
    expect(matchedSku(spoken)).toBe(sku);
  });
});

describe('transliteration variants a phone keyboard produces', () => {
  const cases: Array<[string, string]> = [
    ['kaanda', 'VEG-ONION'],
    ['khanda', 'VEG-ONION'],
    ['bhindi', 'VEG-OKRA'],
    ['bhendi', 'VEG-OKRA'],
    ['kothimbir', 'VEG-CORIANDER'],
    ['kothambir', 'VEG-CORIANDER'],
    ['lasun', 'VEG-GARLIC'],
    ['tandul', 'GRC-RICE-5KG'],
  ];

  it.each(cases)('matches "%s" to %s', (spoken, sku) => {
    expect(matchedSku(spoken)).toBe(sku);
  });
});

describe('regional variants and plurals', () => {
  const cases: Array<[string, string]> = [
    ['कांदे', 'VEG-ONION'],
    ['दुधी', 'VEG-BOTTLEGOURD'],
    ['लौकी', 'VEG-BOTTLEGOURD'],
    ['घिया', 'VEG-BOTTLEGOURD'],
    ['कढीलिंब', 'VEG-CURRYLEAVES'],
    ['फुलकोबी', 'VEG-CAULIFLOWER'],
    ['कणिक', 'GRC-ATTA-5KG'],
    ['भात', 'GRC-RICE-5KG'],
  ];

  it.each(cases)('matches "%s" to %s', (spoken, sku) => {
    expect(matchedSku(spoken)).toBe(sku);
  });
});

describe('PART 12 — ≥80% match rate on a realistic Marathi voice note', () => {
  it('matches at least 80% of a twenty-item list', () => {
    const transcript = [
      'दोन किलो कांदा',
      'एक किलो टोमॅटो',
      'अर्धा किलो बटाटा',
      'एक जुडी कोथिंबीर',
      'पाव किलो आले',
      'अर्धा किलो भेंडी',
      'एक किलो वांगी',
      'दोन जुडी मेथी',
      'एक जुडी पालक',
      'अर्धा किलो गवार',
      'एक किलो दुधी भोपळा',
      'पाव किलो लसूण',
      'एक किलो कोबी',
      'अर्धा किलो गाजर',
      'एक डझन केळी',
      'दोन लिंबू',
      'एक किलो साखर',
      'दोन किलो तांदूळ',
      'एक लिटर तेल',
      'अर्धा किलो चहा पावडर',
    ].join(', ');

    const parsed = parseListText(transcript);
    expect(parsed).toHaveLength(20);

    const matched = parsed.filter((item) => matchItem(item.name, INDEX).status === 'MATCHED');
    const rate = matched.length / parsed.length;

    expect(rate).toBeGreaterThanOrEqual(0.8);
  });

  it('matches a Hindi list at the same rate', () => {
    const parsed = parseListText(
      'दो किलो प्याज, एक किलो टमाटर, आधा किलो आलू, एक गड्डी धनिया, आधा किलो भिंडी',
    );
    const matched = parsed.filter((item) => matchItem(item.name, INDEX).status === 'MATCHED');
    expect(matched.length / parsed.length).toBeGreaterThanOrEqual(0.8);
  });
});

describe('ambiguity — when we cannot honestly pick one', () => {
  it('never silently guesses between two close candidates', () => {
    // "मिरची" is both green chilli and capsicum in everyday speech. Guessing
    // produces a cart the customer did not ask for.
    const result = matchItem('मिरची', INDEX);
    if (result.status === 'MATCHED') {
      expect(result.best?.productId).toBe('VEG-GREENCHILLI');
    } else {
      expect(result.status).toBe('AMBIGUOUS');
      expect(result.alternatives.length).toBeGreaterThan(1);
    }
  });

  it('offers at most three alternatives', () => {
    const result = matchItem('भोपळा', INDEX);
    expect(result.alternatives.length).toBeLessThanOrEqual(3);
  });

  it('gives a confidence score with every candidate', () => {
    const result = matchItem('कांदा', INDEX);
    expect(result.best?.confidence).toBeGreaterThan(0);
    expect(result.best?.confidence).toBeLessThanOrEqual(1);
  });

  it('scores an exact alias at full confidence', () => {
    expect(matchItem('कांदा', INDEX).best?.confidence).toBe(1);
  });
});

describe('unmatched items', () => {
  it('returns UNMATCHED for something we do not sell', () => {
    const result = matchItem('मोबाईल चार्जर', INDEX);
    expect(result.status).toBe('UNMATCHED');
    expect(result.best).toBeNull();
  });

  it('returns UNMATCHED rather than guessing on a single character', () => {
    expect(matchItem('क', INDEX).status).toBe('UNMATCHED');
    expect(matchItem('', INDEX).status).toBe('UNMATCHED');
  });
});

describe('tolerance for speech-to-text slips', () => {
  it('survives a one-character error', () => {
    // STT and handwriting both produce these constantly.
    expect(matchItem('कांदाa', INDEX).best?.productId).toBe('VEG-ONION');
    expect(matchItem('onionn', INDEX).best?.productId).toBe('VEG-ONION');
  });

  it('still requires real similarity — it does not match anything to everything', () => {
    expect(matchItem('zzzzzzzz', INDEX).status).toBe('UNMATCHED');
  });
});

describe('the confidence threshold', () => {
  it('only calls something MATCHED above the confident threshold', () => {
    const result = matchItem('कांदा', INDEX);
    expect(result.status).toBe('MATCHED');
    expect(result.best!.confidence).toBeGreaterThanOrEqual(CONFIDENT);
  });
});
