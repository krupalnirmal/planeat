/**
 * M4 — "Seed 200+ common Marathi grocery terms. The alias dictionary does more
 * work here than the model does."
 *
 * That sentence is the whole design of the Smart List. Speech-to-text on a
 * Marathi voice note in a noisy market produces a spelling nobody planned for,
 * and a general-purpose model asked to "find the product" will confidently map
 * मिरची to capsicum. A row in this table is a fact the owner can see, edit and
 * be held to — and it is the difference between 80% matches and 40%.
 *
 * Each key is a product SKU from `seed.ts`. Aliases cover:
 *   - Marathi, Hindi and English names
 *   - regional variants (कोथिंबीर / धणे, दुधी / लौकी / घिया)
 *   - the Latin transliterations a phone keyboard actually produces
 *   - singular and plural (कांदा / कांदे)
 *
 * Duplicates across products are harmless — the matcher scores every one and
 * marks a genuine collision AMBIGUOUS rather than guessing.
 */

export const PRODUCT_ALIASES: Record<string, string[]> = {
  // ── Vegetables ────────────────────────────────────────────
  'VEG-ONION': [
    'कांदा', 'कांदे', 'कांद्या', 'लाल कांदा', 'प्याज', 'प्याजा',
    'kanda', 'kande', 'kaanda', 'khanda', 'onion', 'onions', 'pyaj', 'pyaaz',
  ],
  'VEG-TOMATO': [
    'टोमॅटो', 'टोमेटो', 'टमाटर', 'टमाटे', 'बेलवांगी',
    'tomato', 'tomatoes', 'tamatar', 'tometo',
  ],
  'VEG-POTATO': [
    'बटाटा', 'बटाटे', 'आलू', 'आलु',
    'batata', 'bataate', 'potato', 'potatoes', 'aloo', 'alu',
  ],
  'VEG-BRINJAL': [
    'वांगी', 'वांगे', 'वांग', 'भरताचे वांगे', 'बैंगन', 'बेंगन',
    'vangi', 'vange', 'brinjal', 'baingan', 'eggplant', 'aubergine',
  ],
  'VEG-OKRA': [
    'भेंडी', 'भेंड्या', 'भिंडी',
    'bhendi', 'bhindi', 'bendi', 'okra', 'ladyfinger', 'lady finger',
  ],
  'VEG-BOTTLEGOURD': [
    'दुधी', 'दुधी भोपळा', 'लौकी', 'घिया',
    'dudhi', 'dudhi bhopla', 'lauki', 'ghiya', 'bottle gourd', 'bottlegourd',
  ],
  'VEG-RIDGEGOURD': [
    'दोडका', 'दोडके', 'शिरळी', 'तोरई', 'तुरई',
    'dodka', 'dodke', 'turai', 'torai', 'ridge gourd', 'ridgegourd',
  ],
  'VEG-CLUSTERBEANS': [
    'गवार', 'गवारी', 'ग्वार', 'ग्वार फली',
    'gawar', 'gavar', 'guar', 'gvar', 'cluster beans', 'clusterbeans',
  ],
  'VEG-FENUGREEK': [
    'मेथी', 'मेथीची भाजी', 'मेथी भाजी', 'मेथी पाला',
    'methi', 'methi bhaji', 'fenugreek', 'fenugreek leaves',
  ],
  'VEG-FRESHPEANUT': [
    'ओले शेंगदाणे', 'शेंगदाणे', 'शेंगदाणा', 'भुईमूग', 'मूंगफली',
    'shengdane', 'shengdana', 'singdana', 'ole shengdane', 'groundnut',
    'groundnuts', 'fresh peanut', 'mungfali',
  ],
  'VEG-SPINACH': [
    'पालक', 'पालकाची भाजी', 'पालक भाजी',
    'palak', 'palak bhaji', 'spinach',
  ],
  'VEG-CORIANDER': [
    'कोथिंबीर', 'कोथंबीर', 'कोथिंबिर', 'धणे', 'धनिया', 'हिरवी कोथिंबीर',
    'kothimbir', 'kothambir', 'dhania', 'dhane', 'coriander', 'cilantro',
  ],
  'VEG-CURRYLEAVES': [
    'कढीपत्ता', 'कढीलिंब', 'कडीपत्ता', 'करी पत्ता', 'मीठा नीम',
    'kadipatta', 'kadhipatta', 'kadi patta', 'curry leaves', 'curryleaves',
  ],
  'VEG-CABBAGE': [
    'कोबी', 'पत्ताकोबी', 'पानकोबी', 'पत्ता गोभी', 'बंद गोभी',
    'kobi', 'patta kobi', 'cabbage', 'patta gobhi', 'band gobhi',
  ],
  'VEG-CAULIFLOWER': [
    'फ्लॉवर', 'फुलकोबी', 'फूल गोभी', 'गोबी',
    'flower', 'phool gobhi', 'cauliflower', 'phulkobi', 'gobi',
  ],
  'VEG-CARROT': [
    'गाजर', 'गाजरे', 'लाल गाजर',
    'gajar', 'gaajar', 'carrot', 'carrots',
  ],
  'VEG-GREENCHILLI': [
    'हिरवी मिरची', 'मिरची', 'मिरच्या', 'हिरवी मिर्ची', 'हरी मिर्च',
    'mirchi', 'mirch', 'hirvi mirchi', 'green chilli', 'green chili',
    'hari mirch', 'chilli',
  ],
  'VEG-GINGER': [
    'आले', 'आलं', 'अदरक', 'आद्रक',
    'ale', 'aale', 'adrak', 'ginger',
  ],
  'VEG-GARLIC': [
    'लसूण', 'लसुण', 'लहसुन', 'लसणाच्या पाकळ्या',
    'lasun', 'lasoon', 'lehsun', 'garlic',
  ],
  'VEG-PUMPKIN': [
    'लाल भोपळा', 'भोपळा', 'कद्दू', 'काशीफळ',
    'bhopla', 'lal bhopla', 'kaddu', 'pumpkin', 'red pumpkin',
  ],
  'VEG-BEETROOT': [
    'बीट', 'बीटरूट', 'चुकंदर',
    'beet', 'beetroot', 'chukandar',
  ],
  'VEG-CAPSICUM': [
    'ढोबळी मिरची', 'ढोबळी', 'सिमला मिरची', 'शिमला मिर्च', 'भोपळी मिरची',
    'dhobli', 'dhobli mirchi', 'shimla mirch', 'capsicum', 'bell pepper',
  ],
  'VEG-CUCUMBER': [
    'काकडी', 'काकड्या', 'खीरा', 'ककडी',
    'kakdi', 'kakadi', 'kheera', 'cucumber',
  ],

  // ── Fruits ────────────────────────────────────────────────
  'FRT-BANANA': [
    'केळी', 'केळे', 'केळ', 'केला', 'कच्ची केळी',
    'keli', 'kele', 'kela', 'banana', 'bananas',
  ],
  'FRT-APPLE': [
    'सफरचंद', 'सफरचंदे', 'सेब', 'ॲपल',
    'safarchand', 'seb', 'apple', 'apples',
  ],
  'FRT-MOSAMBI': [
    'मोसंबी', 'मौसंबी', 'मुसंबी',
    'mosambi', 'mausambi', 'sweet lime', 'sweetlime',
  ],
  'FRT-PAPAYA': [
    'पपई', 'पपया', 'पपीता',
    'papai', 'papaya', 'papita',
  ],
  'FRT-POMEGRANATE': [
    'डाळिंब', 'डाळिंबे', 'अनार',
    'dalimb', 'dalimba', 'anar', 'pomegranate',
  ],
  'FRT-LEMON': [
    'लिंबू', 'लिंबे', 'नींबू', 'निंबू', 'कागदी लिंबू',
    'limbu', 'limboo', 'nimbu', 'lemon', 'lime',
  ],

  // ── Dairy ─────────────────────────────────────────────────
  'DRY-MILK-500': [
    'दूध', 'दुध', 'गाईचे दूध', 'म्हशीचे दूध',
    'dudh', 'doodh', 'milk',
  ],
  'DRY-CURD-400': [
    'दही', 'ताक दही', 'योगर्ट',
    'dahi', 'curd', 'yoghurt', 'yogurt',
  ],
  'DRY-PANEER-200': [
    'पनीर', 'पनिर', 'छेना',
    'paneer', 'panir', 'cottage cheese',
  ],
  'DRY-GHEE-500': [
    'तूप', 'तुप', 'साजूक तूप', 'घी',
    'toop', 'tup', 'ghee', 'cow ghee',
  ],

  // ── Bakery ────────────────────────────────────────────────
  'BKY-BREAD-400': [
    'ब्रेड', 'पाव ब्रेड', 'गव्हाचा ब्रेड', 'डबल रोटी',
    'bread', 'brown bread', 'wheat bread',
  ],
  'BKY-PAV-6': [
    'पाव', 'लादी पाव', 'पावाचे', 'लादीपाव',
    'pav', 'ladi pav', 'ladipav', 'bun',
  ],
  'BKY-MARIE-250': [
    'बिस्किट', 'बिस्किटे', 'मारी बिस्किट', 'बिस्कुट',
    'biscuit', 'biscuits', 'marie', 'marie biscuit',
  ],

  // ── Ice cream ─────────────────────────────────────────────
  'ICE-VANILLA-700': [
    'आइस्क्रीम', 'आईस्क्रीम', 'व्हॅनिला', 'आइसक्रीम',
    'ice cream', 'icecream', 'vanilla', 'vanilla ice cream',
  ],
  'ICE-KULFI-4': [
    'कुल्फी', 'मलई कुल्फी', 'कुलफी',
    'kulfi', 'malai kulfi',
  ],

  // ── Grocery ───────────────────────────────────────────────
  'GRC-TOORDAL-1KG': [
    'तूर डाळ', 'तुरडाळ', 'डाळ', 'अरहर दाल', 'तूर दाल',
    'toor dal', 'tur dal', 'toordal', 'arhar', 'dal', 'daal',
  ],
  'GRC-RICE-5KG': [
    'तांदूळ', 'तांदुळ', 'चावल', 'भात', 'सोना मसुरी',
    'tandul', 'tandool', 'chawal', 'rice', 'sona masoori',
  ],
  'GRC-ATTA-5KG': [
    'गव्हाचे पीठ', 'कणिक', 'कणीक', 'आटा', 'गेहूँ का आटा', 'पीठ',
    'atta', 'kanik', 'gahu peeth', 'wheat flour', 'flour',
  ],
  'GRC-OIL-1L': [
    'तेल', 'सूर्यफूल तेल', 'खाद्यतेल', 'सरसों तेल', 'रिफाइंड तेल',
    'tel', 'oil', 'sunflower oil', 'cooking oil', 'refined oil',
  ],
  'GRC-SUGAR-1KG': [
    'साखर', 'साकर', 'चीनी', 'शक्कर',
    'sakhar', 'sakkar', 'chini', 'sugar', 'shakkar',
  ],
  'GRC-TEA-250': [
    'चहा', 'चहा पावडर', 'चाय', 'चाय पत्ती', 'चहापूड',
    'chaha', 'chai', 'chai patti', 'tea', 'tea powder',
  ],
};

/** Sanity figure for the seed log — M4 asks for 200+. */
export const ALIAS_COUNT = Object.values(PRODUCT_ALIASES).reduce(
  (sum, list) => sum + list.length,
  0,
);
