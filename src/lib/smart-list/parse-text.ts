import { normaliseSearchText } from '@/lib/catalog/text';
import { isQuantityWord, parseQuantityWords } from './numbers';
import { isUnitWord, parseUnitWords } from './units';

/**
 * Splits a spoken or written grocery list into line items, deterministically.
 *
 * This is BOTH the fallback when the AI is unavailable (M4: "If AI is
 * unavailable, fall back to manual list entry") and the safety net when the
 * model returns something unusable. For a list like
 *
 *   "दोन किलो कांदा, एक किलो टोमॅटो, अर्धा किलो बटाटा आणि एक जुडी कोथिंबीर"
 *
 * it gets all four items and all four quantities right without a model at all.
 * That is not a consolation prize: the alias table does more work here than
 * the model does, and this parser is what feeds it.
 */

export interface ParsedListItem {
  /** Exactly what the customer said, kept for the review screen. */
  rawText: string;
  /** The item name with quantity and unit words removed. */
  name: string;
  quantity: number | null;
  unitWord: string | null;
}

/**
 * Separators people actually use: commas, newlines, bullets, and the
 * conjunctions आणि / और / and — which appear before the LAST item far more
 * often than anywhere else.
 */
const SEPARATOR = /[,\n;•|]+|\s+(?:आणि|अणि|और|तसेच|and)\s+/gi;

export function splitIntoLines(text: string): string[] {
  return text
    .split(SEPARATOR)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/**
 * Strips the quantity and unit words, leaving the item name.
 *
 * Word-by-word rather than by replacing the matched substrings: "पाच" appears
 * inside no vegetable name, but a naive `replace` of "एक" would corrupt
 * "एकदम" and a replace of "g" would corrupt half the Latin transliterations.
 */
function stripQuantityWords(line: string): string {
  return line
    .split(/\s+/)
    .filter((word) => word.length > 0 && !isQuantityWord(word) && !isUnitWord(word))
    .join(' ')
    .trim();
}

export function parseLine(line: string): ParsedListItem {
  const quantity = parseQuantityWords(line);
  const unit = parseUnitWords(line);
  const name = stripQuantityWords(line);

  return {
    rawText: line.trim(),
    // If stripping left nothing, the whole line was a quantity — keep the raw
    // text so the review screen shows the customer what it could not read,
    // rather than an empty row (M4: never silently dropped).
    name: name.length > 0 ? name : line.trim(),
    quantity: quantity.value,
    unitWord: unit.match?.word ?? null,
  };
}

export function parseListText(text: string): ParsedListItem[] {
  return splitIntoLines(text)
    .map(parseLine)
    .filter((item) => normaliseSearchText(item.name).length > 1);
}
