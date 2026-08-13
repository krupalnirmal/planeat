/**
 * AI-4 and AI-5 prompts (PART 6.3), versioned.
 *
 * Both do ONE job: split a grocery list into line items. They never choose a
 * product, never invent a quantity, and never translate. Matching happens
 * afterwards against the alias table, which is auditable and fixable in the
 * admin panel — a model that silently maps "मिरची" to capsicum is a bug nobody
 * can find.
 */

export const SMART_LIST_PARSE_VERSION = 'smart-list-parse.v1';
export const SMART_LIST_PHOTO_VERSION = 'smart-list-photo.v1';

const SHARED_RULES = `RULES:
1. Split into one entry per grocery item.
2. Keep "item" EXACTLY as written, in the same script. Do not translate it,
   do not correct the spelling, do not expand abbreviations.
3. "quantity" is the number that was actually said or written. If there is no
   number, return null. Never guess one.
4. "unit" is the unit word as written ("किलो", "जुडी", "kg", "bunch"). If none
   was given, return null.
5. Ignore greetings, filler and anything that is not a grocery item.
6. Return JSON only. No markdown, no commentary, no code fences.`;

const PARSE_SYSTEM = `You split a spoken grocery list from Maharashtra, India into structured line items.

The text may be Marathi, Hindi, English, or a mix of all three in one sentence.
That is normal here and is not an error to correct.

${SHARED_RULES}`;

const PHOTO_SYSTEM = `You read a photographed handwritten grocery list from Maharashtra, India.

The handwriting may be Marathi, Hindi or English, often mixed. Lists are
usually one item per line, sometimes with a quantity before or after the item.

If a word is genuinely illegible, include your best reading rather than
skipping the line — the customer reviews every item before it reaches the
cart, and a wrong guess they can fix beats a missing line they never see.

${SHARED_RULES}`;

const SHAPE = JSON.stringify({
  items: [
    { item: '<exactly as written>', quantity: 2, unit: 'किलो' },
    { item: '<exactly as written>', quantity: null, unit: null },
  ],
});

export function buildTranscriptParsePrompt(transcript: string): {
  system: string;
  user: string;
} {
  return {
    system: PARSE_SYSTEM,
    user: [
      'GROCERY LIST:',
      transcript,
      '',
      'Return JSON exactly in this shape:',
      SHAPE,
    ].join('\n'),
  };
}

export function buildPhotoParsePrompt(): { system: string; user: string } {
  return {
    system: PHOTO_SYSTEM,
    user: [
      'Read every grocery item from this photograph.',
      '',
      'Return JSON exactly in this shape:',
      SHAPE,
    ].join('\n'),
  };
}

/** R6 — the single retry gets the validation errors verbatim. */
export function buildParseRetryUser(originalUser: string, errors: readonly string[]): string {
  return [
    originalUser,
    '',
    'YOUR PREVIOUS RESPONSE WAS REJECTED. Fix exactly these problems:',
    ...errors.map((error) => `- ${error}`),
    '',
    'Return the corrected JSON only.',
  ].join('\n');
}
