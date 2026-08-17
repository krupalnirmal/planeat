/**
 * Resolves a spoken quantity ("अडीच किलो" → 2500 g) into real, already-priced
 * packs, for the category row's voice-add.
 *
 * The catalogue only sells fixed packs (250 g / 500 g / 1 kg …), so "2.5 kg"
 * is never a price of its own — it is however many of the existing packs get
 * closest to that weight without going under, using only prices the owner
 * actually set. Cart lines and checkout totals stay exactly what this
 * function returns; nothing is charged that isn't one of these real packs.
 */

export interface PackCandidate {
  id: string;
  quantity: number;
  unit: string;
  pricePaise: bigint;
  stockQty: number;
}

export interface PackCombinationLine {
  variantId: string;
  count: number;
  quantity: number;
  unit: string;
  pricePaise: bigint;
}

export interface PackCombination {
  lines: PackCombinationLine[];
  totalQuantity: number;
  unit: string;
  totalPricePaise: bigint;
}

/** Mirrors `MAX_QTY_PER_LINE` in `src/lib/cart/queries.ts` — no line should
    ask the cart to hold more than it will accept. */
const MAX_PACKS_PER_LINE = 20;

export function combinePacks(
  targetQuantity: number,
  targetUnit: string,
  variants: PackCandidate[],
): PackCombination | null {
  if (targetQuantity <= 0) return null;

  const candidates = variants
    .filter((v) => v.unit === targetUnit && v.stockQty > 0)
    .sort((a, b) => b.quantity - a.quantity);

  if (candidates.length === 0) return null;

  const counts = new Map<string, number>();
  let remaining = targetQuantity;

  // Largest packs first: fewer lines, and it mirrors how a shopkeeper would
  // actually bag an order.
  for (const variant of candidates) {
    if (remaining <= 0) break;
    const want = Math.floor(remaining / variant.quantity);
    const take = Math.min(want, variant.stockQty, MAX_PACKS_PER_LINE);
    if (take > 0) {
      counts.set(variant.id, take);
      remaining -= take * variant.quantity;
    }
  }

  // A remainder smaller than every pack (e.g. 2.2 kg with only 250/500/1000 g
  // packs) still has to come from somewhere — round up with one more of the
  // smallest pack rather than under-filling the order.
  if (remaining > 0) {
    const smallest = candidates[candidates.length - 1];
    const current = counts.get(smallest.id) ?? 0;
    if (current < Math.min(smallest.stockQty, MAX_PACKS_PER_LINE)) {
      counts.set(smallest.id, current + 1);
    }
  }

  if (counts.size === 0) return null;

  const lines: PackCombinationLine[] = [...counts.entries()].map(([id, count]) => {
    const variant = candidates.find((v) => v.id === id)!;
    return { variantId: id, count, quantity: variant.quantity, unit: variant.unit, pricePaise: variant.pricePaise };
  });

  const totalQuantity = lines.reduce((sum, line) => sum + line.quantity * line.count, 0);
  const totalPricePaise = lines.reduce((sum, line) => sum + line.pricePaise * BigInt(line.count), 0n);

  return { lines, totalQuantity, unit: targetUnit, totalPricePaise };
}
