import { normaliseSearchText, transliterationKey } from '@/lib/catalog/text';
import type { UnitType } from '@/generated/prisma/enums';

/**
 * Matching a spoken item to a real product (M4).
 *
 * PART 12 — "A Marathi voice note yields ≥80% correct matches on the seeded
 * aliases." The alias table is what delivers that, not cleverness here: this
 * function is a ranked lookup over a prebuilt index, with a confidence score
 * and an explicit AMBIGUOUS state when it cannot honestly pick one.
 *
 * Pure, so the whole matching behaviour is testable without a database.
 */

export interface IndexedProduct {
  productId: string;
  variantId: string | null;
  name: string;
  unitType: UnitType;
  pricePaise: bigint | null;
  inStock: boolean;
  /** Names in all three locales plus every alias, already normalised. */
  terms: string[];
}

export type MatchStatus = 'MATCHED' | 'AMBIGUOUS' | 'UNMATCHED';

export interface MatchCandidate {
  productId: string;
  variantId: string | null;
  name: string;
  unitType: UnitType;
  pricePaise: bigint | null;
  inStock: boolean;
  confidence: number;
}

export interface MatchResult {
  status: MatchStatus;
  best: MatchCandidate | null;
  /** M4 — "ambiguous (amber, tap to choose from top 3)". */
  alternatives: MatchCandidate[];
}

/**
 * Confidence thresholds.
 *
 * `CONFIDENT` is deliberately high: a wrong item added silently is worse than
 * an amber row the customer taps once. `MINIMUM` is deliberately low, because
 * M4 says unmatched items must be shown, not dropped — a weak guess the
 * customer can reject beats "not available" for something we do sell.
 */
export const CONFIDENT = 0.8;
export const MINIMUM = 0.35;
/** Two candidates this close together cannot be told apart honestly. */
export const AMBIGUITY_MARGIN = 0.12;

/**
 * Levenshtein distance, capped. Used only as the last resort, so the cost is
 * bounded by how few candidates survive the cheaper checks above it.
 */
function editDistance(a: string, b: string, max = 4): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;

  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);

  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    let rowMin = i;

    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const value = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + cost);
      current.push(value);
      rowMin = Math.min(rowMin, value);
    }

    // Every remaining path is already worse than the cap.
    if (rowMin > max) return max + 1;
    previous = current;
  }

  return previous[b.length];
}

/**
 * Scores one product against one spoken phrase. Higher is better; 0 means no
 * relationship worth showing.
 *
 * The ladder is ordered by how much we can trust each signal:
 *   exact term > transliteration > token containment > near-spelling
 */
function scoreProduct(query: string, queryKey: string, product: IndexedProduct): number {
  let best = 0;

  const queryTokens = query.split(' ').filter((token) => token.length > 1);

  for (const term of product.terms) {
    if (term.length === 0) continue;

    // 1. The customer said exactly what the catalogue calls it, in any
    //    language, or exactly one of its aliases.
    if (term === query) return 1;

    // 2. Same word, different transliteration: kanda / kaanda / khanda.
    if (transliterationKey(term) === queryKey) {
      best = Math.max(best, 0.92);
      continue;
    }

    // 3. One contains the other as a whole token — "कांदा" inside
    //    "लाल कांदा", or "onion" inside "onion seeds". Scaled by how much of
    //    the longer string the shorter one accounts for, so "onion" matching
    //    "onion" scores far above "onion" matching "spring onion greens".
    const termTokens = term.split(' ').filter((token) => token.length > 1);
    const shared = termTokens.filter((token) => queryTokens.includes(token)).length;

    if (shared > 0) {
      const coverage = shared / Math.max(termTokens.length, queryTokens.length);
      best = Math.max(best, 0.55 + coverage * 0.3);
      continue;
    }

    if (term.includes(query) || query.includes(term)) {
      const ratio = Math.min(term.length, query.length) / Math.max(term.length, query.length);
      best = Math.max(best, 0.45 + ratio * 0.3);
      continue;
    }

    // 4. A near-miss spelling. Speech-to-text and handwriting both produce
    //    these constantly, so a one-character slip must not cost the match.
    if (Math.abs(term.length - query.length) <= 3) {
      const distance = editDistance(term, query);
      if (distance <= 2) {
        best = Math.max(best, distance === 1 ? 0.75 : 0.55);
      }
    }
  }

  return best;
}

export function matchItem(spokenName: string, index: readonly IndexedProduct[]): MatchResult {
  const query = normaliseSearchText(spokenName);
  if (query.length < 2) return { status: 'UNMATCHED', best: null, alternatives: [] };

  const queryKey = transliterationKey(query);

  const scored = index
    .map((product) => ({ product, confidence: scoreProduct(query, queryKey, product) }))
    .filter((entry) => entry.confidence >= MINIMUM)
    .sort(
      (a, b) =>
        b.confidence - a.confidence ||
        // A tie goes to something we can actually deliver.
        Number(b.product.inStock) - Number(a.product.inStock) ||
        a.product.name.localeCompare(b.product.name),
    );

  if (scored.length === 0) return { status: 'UNMATCHED', best: null, alternatives: [] };

  const toCandidate = (entry: (typeof scored)[number]): MatchCandidate => ({
    productId: entry.product.productId,
    variantId: entry.product.variantId,
    name: entry.product.name,
    unitType: entry.product.unitType,
    pricePaise: entry.product.pricePaise,
    inStock: entry.product.inStock,
    confidence: Number(entry.confidence.toFixed(2)),
  });

  const best = toCandidate(scored[0]);
  const alternatives = scored.slice(0, 3).map(toCandidate);

  // Two candidates within the margin means we cannot honestly pick one —
  // "मिरची" is green chilli and capsicum and a spice, and guessing produces a
  // cart the customer did not ask for.
  const runnerUp = scored[1];
  const tooClose = runnerUp !== undefined && scored[0].confidence - runnerUp.confidence < AMBIGUITY_MARGIN;

  if (best.confidence >= CONFIDENT && !tooClose) {
    return { status: 'MATCHED', best, alternatives };
  }

  return { status: 'AMBIGUOUS', best, alternatives };
}
