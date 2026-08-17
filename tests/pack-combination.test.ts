import { describe, expect, it } from 'vitest';
import { combinePacks, type PackCandidate } from '@/lib/catalog/pack-combination';

/**
 * The category row's voice-add resolves a spoken quantity into real,
 * already-priced packs rather than inventing a price for an arbitrary
 * weight (D-211) — this is the greedy-with-round-up algorithm that makes
 * that honest: only real variant prices ever appear in a total.
 */

const CARROT_PACKS: PackCandidate[] = [
  { id: 'v250', quantity: 250, unit: 'G', pricePaise: 1300n, stockQty: 50 },
  { id: 'v500', quantity: 500, unit: 'G', pricePaise: 2500n, stockQty: 50 },
  { id: 'v1000', quantity: 1000, unit: 'G', pricePaise: 5000n, stockQty: 50 },
];

describe('combinePacks', () => {
  it('reaches an exact target with the fewest packs, largest first', () => {
    const result = combinePacks(2500, 'G', CARROT_PACKS);
    expect(result).not.toBeNull();
    expect(result!.totalQuantity).toBe(2500);
    expect(result!.totalPricePaise).toBe(5000n * 2n + 2500n); // 2×1kg + 1×500g
    expect(result!.lines).toEqual([
      { variantId: 'v1000', count: 2, quantity: 1000, unit: 'G', pricePaise: 5000n },
      { variantId: 'v500', count: 1, quantity: 500, unit: 'G', pricePaise: 2500n },
    ]);
  });

  it('rounds up with the smallest pack when the target falls between denominations', () => {
    // 2.2 kg is not exactly reachable from 250/500/1000 g packs; 2×1kg leaves
    // 200 g remaining, which is rounded up with one more 250 g pack.
    const result = combinePacks(2200, 'G', CARROT_PACKS);
    expect(result).not.toBeNull();
    expect(result!.totalQuantity).toBe(2250);
    expect(result!.totalPricePaise).toBe(5000n * 2n + 1300n);
  });

  it('returns null when no variant matches the requested unit', () => {
    expect(combinePacks(500, 'ML', CARROT_PACKS)).toBeNull();
  });

  it('returns null for a non-positive target', () => {
    expect(combinePacks(0, 'G', CARROT_PACKS)).toBeNull();
    expect(combinePacks(-100, 'G', CARROT_PACKS)).toBeNull();
  });

  it('skips out-of-stock variants entirely', () => {
    const packs: PackCandidate[] = [
      { id: 'v1000-out', quantity: 1000, unit: 'G', pricePaise: 5000n, stockQty: 0 },
      { id: 'v500', quantity: 500, unit: 'G', pricePaise: 2500n, stockQty: 50 },
    ];
    const result = combinePacks(1000, 'G', packs);
    expect(result).not.toBeNull();
    expect(result!.lines).toEqual([
      { variantId: 'v500', count: 2, quantity: 500, unit: 'G', pricePaise: 2500n },
    ]);
  });

  it('caps how many of one pack it takes at the available stock', () => {
    const packs: PackCandidate[] = [
      { id: 'v1000', quantity: 1000, unit: 'G', pricePaise: 5000n, stockQty: 1 },
      { id: 'v500', quantity: 500, unit: 'G', pricePaise: 2500n, stockQty: 50 },
    ];
    // Wants 2 kg, but only one 1 kg pack is in stock — the rest comes from 500 g packs.
    const result = combinePacks(2000, 'G', packs);
    expect(result).not.toBeNull();
    expect(result!.totalQuantity).toBe(2000);
    expect(result!.lines).toEqual([
      { variantId: 'v1000', count: 1, quantity: 1000, unit: 'G', pricePaise: 5000n },
      { variantId: 'v500', count: 2, quantity: 500, unit: 'G', pricePaise: 2500n },
    ]);
  });
});
