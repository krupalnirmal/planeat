import { describe, expect, it } from 'vitest';
import {
  addPercent,
  formatPaise,
  mulPaise,
  paise,
  paiseToRupees,
  rupeesToPaise,
} from '@/lib/money';

/** R4 — money is integer paise in a BigInt. These tests are the guard rail. */

describe('paise conversion', () => {
  it('refuses a non-integer number', () => {
    expect(() => paise(12.5)).toThrow(TypeError);
  });

  it('converts rupees to paise without float drift', () => {
    expect(rupeesToPaise(12.5)).toBe(1250n);
    expect(rupeesToPaise('149')).toBe(14900n);
    expect(rupeesToPaise('0.07')).toBe(7n);
    // 0.1 + 0.2 in floats is the classic failure; going through strings is not.
    expect(rupeesToPaise('1234.56')).toBe(123456n);
  });

  it('handles negative amounts', () => {
    expect(rupeesToPaise('-25.50')).toBe(-2550n);
  });

  it('round-trips back to rupees for display', () => {
    expect(paiseToRupees(1250n)).toBe(12.5);
  });
});

describe('arithmetic', () => {
  it('multiplies by a fractional factor and rounds half up', () => {
    expect(mulPaise(1000n, 1.15)).toBe(1150n);
    expect(mulPaise(333n, 1.15)).toBe(383n); // 382.95 → 383
  });

  it('adds the B3 wallet buffer of 15%', () => {
    // A ₹1,400 estimated period cost prepays ₹1,610.
    expect(addPercent(140000n, 15)).toBe(161000n);
  });

  it('stays exact on large amounts', () => {
    // ₹10,00,000 — well past anything Number can hold in paise safely once
    // multiplied, which is the whole reason for BigInt.
    expect(addPercent(100_000_000n, 15)).toBe(115_000_000n);
  });
});

describe('Indian currency formatting', () => {
  it('groups lakhs the Indian way', () => {
    expect(formatPaise(12345600n)).toBe('₹1,23,456');
    expect(formatPaise(100000n)).toBe('₹1,000');
  });

  it('shows paise only when they are non-zero', () => {
    expect(formatPaise(1250n)).toBe('₹12.50');
    expect(formatPaise(1200n)).toBe('₹12');
  });

  it('can hide paise on request', () => {
    expect(formatPaise(1250n, { hidePaise: true })).toBe('₹12');
  });

  it('renders negative balances with the sign outside the symbol', () => {
    expect(formatPaise(-2550n)).toBe('-₹25.50');
  });
});
