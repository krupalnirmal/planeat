import { describe, expect, it } from 'vitest';
import { isQuantityWord, normaliseDigits, parseQuantityWords } from '@/lib/smart-list/numbers';
import { lookupUnit, toProductQuantity } from '@/lib/smart-list/units';
import { parseLine, parseListText, splitIntoLines } from '@/lib/smart-list/parse-text';

/**
 * M4 — reading a spoken grocery list.
 *
 * A customer says "दीड किलो कांदा", never "1.5 kg onion". Getting the item
 * right and the amount wrong is worse than not parsing at all: they see a
 * plausible number and do not check it.
 */

describe('Devanagari digits', () => {
  it('converts to ASCII', () => {
    expect(normaliseDigits('२')).toBe('2');
    expect(normaliseDigits('१०')).toBe('10');
    expect(normaliseDigits('२ किलो')).toBe('2 किलो');
  });
});

describe('Marathi quantity words', () => {
  const cases: Array<[string, number]> = [
    ['एक किलो कांदा', 1],
    ['दोन किलो टोमॅटो', 2],
    ['तीन जुडी मेथी', 3],
    ['पाच नग लिंबू', 5],
    ['दहा किलो तांदूळ', 10],
  ];

  it.each(cases)('reads "%s" as %d', (text, expected) => {
    expect(parseQuantityWords(text).value).toBe(expected);
  });
});

describe('Marathi fractions — the ones a market actually uses', () => {
  const cases: Array<[string, number]> = [
    ['पाव किलो आले', 0.25],
    ['अर्धा किलो बटाटा', 0.5],
    ['पाऊण किलो गवार', 0.75],
    ['सव्वा किलो कांदा', 1.25],
    ['दीड किलो टोमॅटो', 1.5],
    ['अडीच किलो बटाटा', 2.5],
  ];

  it.each(cases)('reads "%s" as %s', (text, expected) => {
    expect(parseQuantityWords(text).value).toBe(expected);
  });

  it('reads साडेतीन as 3.5, written as one word or two', () => {
    expect(parseQuantityWords('साडेतीन किलो').value).toBe(3.5);
    expect(parseQuantityWords('साडे तीन किलो').value).toBe(3.5);
  });

  it('knows अडीच is 2.5 and साडेदोन is not a word', () => {
    // Exactly the kind of thing a general-purpose model gets wrong and a
    // lookup table does not.
    expect(parseQuantityWords('अडीच किलो').value).toBe(2.5);
  });
});

describe('Hindi and English quantities', () => {
  it('reads Hindi number and fraction words', () => {
    expect(parseQuantityWords('दो किलो प्याज').value).toBe(2);
    expect(parseQuantityWords('आधा किलो आलू').value).toBe(0.5);
    expect(parseQuantityWords('ढाई किलो').value).toBe(2.5);
    expect(parseQuantityWords('डेढ़ किलो').value).toBe(1.5);
  });

  it('reads English words and plain digits', () => {
    expect(parseQuantityWords('two kilos onion').value).toBe(2);
    expect(parseQuantityWords('half kg potato').value).toBe(0.5);
    expect(parseQuantityWords('3 kg tomato').value).toBe(3);
    expect(parseQuantityWords('२ किलो कांदा').value).toBe(2);
  });

  it('returns null when no number was said', () => {
    expect(parseQuantityWords('कांदा').value).toBeNull();
    expect(parseQuantityWords('coriander').value).toBeNull();
  });
});

describe('unit words', () => {
  it('maps kilos to grams with a factor of 1000', () => {
    expect(lookupUnit('किलो')).toMatchObject({ unit: 'G', factor: 1000 });
    expect(lookupUnit('kg')).toMatchObject({ unit: 'G', factor: 1000 });
  });

  it('maps all three regional words for a bunch', () => {
    // जुडी, गड्डी and पेंडी are all current in Ahmednagar district.
    for (const word of ['जुडी', 'गड्डी', 'पेंडी', 'bunch']) {
      expect(lookupUnit(word)).toMatchObject({ unit: 'BUNCH' });
    }
  });

  it('maps a dozen to 12 pieces', () => {
    expect(lookupUnit('डझन')).toMatchObject({ unit: 'PIECE', factor: 12 });
  });

  it('returns null for a word that is not a unit', () => {
    expect(lookupUnit('कांदा')).toBeNull();
  });
});

describe('resolving to the product quantity', () => {
  it('turns "दीड किलो" into 1500 g', () => {
    expect(toProductQuantity(1.5, lookupUnit('किलो'), 'G')).toEqual({ quantity: 1500, unit: 'G' });
  });

  it('turns "पाव किलो" into 250 g', () => {
    expect(toProductQuantity(0.25, lookupUnit('किलो'), 'G')).toEqual({ quantity: 250, unit: 'G' });
  });

  it('turns "दोन जुड्या" into 2 bunches', () => {
    expect(toProductQuantity(2, lookupUnit('जुडी'), 'BUNCH')).toEqual({
      quantity: 2,
      unit: 'BUNCH',
    });
  });

  it('turns "एक डझन" into 12 pieces', () => {
    expect(toProductQuantity(1, lookupUnit('डझन'), 'PIECE')).toEqual({
      quantity: 12,
      unit: 'PIECE',
    });
  });

  it('defaults a bare number on a weighed product to kilograms', () => {
    // "दोन कांदे" in a vegetable market means two kilos, not two onions.
    expect(toProductQuantity(2, null, 'G')).toEqual({ quantity: 2000, unit: 'G' });
  });

  it('defaults a bare number on a counted product to a count', () => {
    expect(toProductQuantity(2, null, 'BUNCH')).toEqual({ quantity: 2, unit: 'BUNCH' });
  });

  it('never produces a zero quantity', () => {
    expect(toProductQuantity(null, null, 'G').quantity).toBeGreaterThan(0);
    expect(toProductQuantity(0.0001, lookupUnit('ग्रॅम'), 'G').quantity).toBeGreaterThan(0);
  });
});

describe('splitting a spoken list', () => {
  it('splits on commas and the Marathi "आणि"', () => {
    const lines = splitIntoLines('दोन किलो कांदा, एक किलो टोमॅटो आणि एक जुडी कोथिंबीर');
    expect(lines).toHaveLength(3);
    expect(lines[2]).toContain('कोथिंबीर');
  });

  it('splits on newlines, for a typed or photographed list', () => {
    expect(splitIntoLines('कांदा\nबटाटा\nटोमॅटो')).toHaveLength(3);
  });

  it('splits on the Hindi और and English and', () => {
    expect(splitIntoLines('प्याज और आलू')).toHaveLength(2);
    expect(splitIntoLines('onion and potato')).toHaveLength(2);
  });
});

describe('parsing a line into item, quantity and unit', () => {
  it('strips the quantity and unit words from the name', () => {
    const parsed = parseLine('दोन किलो कांदा');
    expect(parsed.name).toBe('कांदा');
    expect(parsed.quantity).toBe(2);
    expect(parsed.unitWord).toBe('किलो');
  });

  it('keeps a multi-word item name intact', () => {
    const parsed = parseLine('अर्धा किलो दुधी भोपळा');
    expect(parsed.name).toBe('दुधी भोपळा');
    expect(parsed.quantity).toBe(0.5);
  });

  it('handles a line with no quantity at all', () => {
    const parsed = parseLine('कोथिंबीर');
    expect(parsed.name).toBe('कोथिंबीर');
    expect(parsed.quantity).toBeNull();
  });

  it('keeps the raw text when stripping would leave nothing', () => {
    // M4 — never silently dropped. The review screen must show the customer
    // what it could not read, not an empty row.
    const parsed = parseLine('दोन किलो');
    expect(parsed.rawText).toBe('दोन किलो');
    expect(parsed.name.length).toBeGreaterThan(0);
  });

  it('is not fooled by a quantity word inside a longer word', () => {
    // Naive substring replacement of "एक" would corrupt "एकदम".
    expect(parseLine('एकदम ताजी कोथिंबीर').name).toContain('एकदम');
  });
});

describe('the full deterministic parse — the AI-unavailable path', () => {
  it('reads a realistic Marathi voice note without a model', () => {
    const items = parseListText(
      'दोन किलो कांदा, एक किलो टोमॅटो, अर्धा किलो बटाटा आणि एक जुडी कोथिंबीर',
    );

    expect(items).toHaveLength(4);
    expect(items.map((item) => item.name)).toEqual(['कांदा', 'टोमॅटो', 'बटाटा', 'कोथिंबीर']);
    expect(items.map((item) => item.quantity)).toEqual([2, 1, 0.5, 1]);
    expect(items[3].unitWord).toBe('जुडी');
  });

  it('reads the Hindi equivalent', () => {
    const items = parseListText('दो किलो प्याज, आधा किलो आलू और एक गड्डी धनिया');
    expect(items).toHaveLength(3);
    expect(items.map((item) => item.quantity)).toEqual([2, 0.5, 1]);
  });

  it('reads a mixed-script list, which is normal here', () => {
    const items = parseListText('2 kg कांदा, half kg potato, एक जुडी methi');
    expect(items).toHaveLength(3);
    expect(items.map((item) => item.quantity)).toEqual([2, 0.5, 1]);
  });

  it('drops nothing but noise', () => {
    expect(parseListText('कांदा, , बटाटा')).toHaveLength(2);
  });
});

describe('quantity word detection', () => {
  it('recognises numerals, words and fractions', () => {
    expect(isQuantityWord('2')).toBe(true);
    expect(isQuantityWord('२')).toBe(true);
    expect(isQuantityWord('दोन')).toBe(true);
    expect(isQuantityWord('अर्धा')).toBe(true);
    expect(isQuantityWord('साडेचार')).toBe(true);
  });

  it('does not mistake a vegetable for a number', () => {
    expect(isQuantityWord('कांदा')).toBe(false);
    expect(isQuantityWord('onion')).toBe(false);
  });
});
