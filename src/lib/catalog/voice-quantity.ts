import { parseQuantityWords } from '@/lib/smart-list/numbers';
import { parseUnitWords, toProductQuantity } from '@/lib/smart-list/units';
import type { UnitType } from '@/generated/prisma/enums';

/**
 * Reads a quantity out of a voice transcript for the category row's
 * voice-add — same deterministic parser Smart List uses for "दोन किलो कांदा",
 * just reading one quantity instead of a whole list. No AI call: this is a
 * single short phrase, and the rule-based parser already handles Marathi
 * fraction words (अडीच, दीड, पाव) that a generic model gets wrong.
 */
export function parseVoiceQuantity(
  transcript: string,
  productUnitType: UnitType,
): { quantity: number; unit: UnitType } | null {
  const { value } = parseQuantityWords(transcript);
  if (value === null) return null;

  const { match } = parseUnitWords(transcript);
  return toProductQuantity(value, match, productUnitType);
}
