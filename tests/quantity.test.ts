import { describe, expect, it } from 'vitest';
import { computeQuantity, formatQuantity, servingUnitsFor } from '@/lib/quantity';

/**
 * PART 12 — "Quantity matches B4 exactly for a 4-adult and a 2-adult-1-child
 * household." These are the two worked examples from the brief, plus the
 * boundaries around them.
 */

describe('B4 quantity formula', () => {
  it('gives 1000 g for four adults', () => {
    // 4 serving units × 200 g = 800 g raw → rounded UP to the next 250 → 1000 g
    const result = computeQuantity({ adults: 4, children: 0 }, 'G');
    expect(result.servingUnits).toBe(4);
    expect(result.quantity).toBe(1000);
    expect(result.unit).toBe('G');
    expect(result.flagForAdminReview).toBe(false);
  });

  it('gives 500 g for two adults and one child', () => {
    // 2 + 0.5 = 2.5 units × 200 g = 500 g raw → already a multiple of 250
    const result = computeQuantity({ adults: 2, children: 1 }, 'G');
    expect(result.servingUnits).toBe(2.5);
    expect(result.quantity).toBe(500);
  });

  it('never drops below the 250 g minimum', () => {
    const result = computeQuantity({ adults: 1, children: 0 }, 'G');
    expect(result.quantity).toBe(250);
  });

  it('caps at 2000 g and flags for admin review above it', () => {
    const result = computeQuantity({ adults: 12, children: 0 }, 'G');
    expect(result.quantity).toBe(2000);
    expect(result.exceedsMax).toBe(true);
    expect(result.flagForAdminReview).toBe(true);
  });

  it('always rounds up, never down', () => {
    // 3 units × 200 = 600 g → 750 g, not 500 g.
    expect(computeQuantity({ adults: 3, children: 0 }, 'G').quantity).toBe(750);
  });

  it('treats an empty household as one adult rather than zero', () => {
    expect(servingUnitsFor({ adults: 0, children: 0 })).toBe(1);
    expect(computeQuantity({ adults: 0, children: 0 }, 'G').quantity).toBe(250);
  });
});

describe('B4 piece and bunch items', () => {
  it('gives one bunch per four serving units, minimum one', () => {
    expect(computeQuantity({ adults: 2, children: 0 }, 'BUNCH').quantity).toBe(1);
    expect(computeQuantity({ adults: 4, children: 0 }, 'BUNCH').quantity).toBe(1);
    expect(computeQuantity({ adults: 5, children: 0 }, 'BUNCH').quantity).toBe(2);
    expect(computeQuantity({ adults: 8, children: 0 }, 'BUNCH').quantity).toBe(2);
  });

  it('never flags counted items for review', () => {
    expect(computeQuantity({ adults: 20, children: 0 }, 'PIECE').flagForAdminReview).toBe(false);
  });
});

describe('quantity display', () => {
  it('renders whole kilos as kg', () => {
    expect(formatQuantity(1000, 'G')).toBe('1 kg');
    expect(formatQuantity(2000, 'G')).toBe('2 kg');
  });

  it('keeps sub-kilo weights in grams', () => {
    expect(formatQuantity(750, 'G')).toBe('750 g');
  });
});
