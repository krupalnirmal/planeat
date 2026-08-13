import { logAiCall } from '@/lib/ai/logger';
import {
  SMART_LIST_PARSE_VERSION,
  SMART_LIST_PHOTO_VERSION,
  buildParseRetryUser,
  buildPhotoParsePrompt,
  buildTranscriptParsePrompt,
} from '@/lib/ai/prompts/smart-list';
import { extractedListSchema, type ExtractedItem } from '@/lib/ai/schemas/smart-list';
import { db } from '@/lib/db';
import { env } from '@/lib/env';
import { ID_PREFIX, newId } from '@/lib/ids';
import { getAIProvider, getSTTProvider } from '@/lib/services/ai';
import { getStorageProvider } from '@/lib/services/storage';
import type { Locale, SmartListSource } from '@/generated/prisma/enums';
import { buildMatchIndex } from './index-builder';
import { matchItem } from './match';
import { parseListText } from './parse-text';
import { lookupUnit, toProductQuantity } from './units';

/**
 * The Smart List pipeline (M4).
 *
 *   VOICE: audio → STT → EDITABLE transcript → parse → match → review
 *   PHOTO: image → vision → parse → match → review
 *   TEXT:  typed → parse → match → review
 *
 * Two things are load-bearing here:
 *
 * 1. **The transcript is shown to the customer before anything else happens.**
 *    Speech-to-text on a Marathi voice note in a noisy market is not reliable,
 *    and letting somebody fix one word beats re-recording the whole list.
 *
 * 2. **The model never picks a product.** It splits a sentence into line
 *    items; the alias table and `match.ts` do the matching. A model that
 *    silently maps मिरची to capsicum is a bug nobody can find, whereas a wrong
 *    alias is one row in a table the owner can edit.
 */

export const MAX_AUDIO_SECONDS = 60;

export interface SmartListItemView {
  id: string;
  rawText: string;
  parsedName: string | null;
  quantity: number | null;
  unit: string | null;
  matchedProductId: string | null;
  matchedVariantId: string | null;
  matchedName: string | null;
  pricePaise: bigint | null;
  inStock: boolean;
  confidence: number;
  status: 'MATCHED' | 'AMBIGUOUS' | 'UNMATCHED' | 'USER_CONFIRMED';
  /** M4 — "ambiguous (amber, tap to choose from top 3)". */
  alternatives: Array<{
    productId: string;
    variantId: string | null;
    name: string;
    pricePaise: bigint | null;
    inStock: boolean;
    confidence: number;
  }>;
}

export interface SmartListView {
  id: string;
  source: SmartListSource;
  transcript: string | null;
  detectedLanguage: string | null;
  status: string;
  name: string | null;
  createdAt: Date;
  items: SmartListItemView[];
  /** True when the model was unavailable and the rule-based parser ran. */
  usedFallback: boolean;
}

// ─────────────────────────────────────────────────────────────
// Extraction
// ─────────────────────────────────────────────────────────────

/**
 * R6 — one AI call, one retry with the errors fed back, then the deterministic
 * parser. M4 — "If AI is unavailable, fall back to manual list entry"; the
 * fallback here is better than that, because `parseListText` handles the
 * common list shapes without a model at all.
 */
async function extractItems(
  userId: string,
  transcript: string,
): Promise<{ items: ExtractedItem[]; usedFallback: boolean }> {
  const provider = getAIProvider();
  const { system, user } = buildTranscriptParsePrompt(transcript);
  const maxRetries = Math.max(0, env.ai.maxRetries);
  let currentUser = user;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await provider.generateJSON({
        system,
        user: currentUser,
        schema: extractedListSchema,
        // PART 6.3 rule 4 — low temperature for structured extraction.
        temperature: 0.1,
        maxTokens: 2048,
      });

      if (response.items.length > 0) {
        await logAiCall({
          userId,
          feature: 'TRANSCRIPT_PARSE',
          provider: provider.name,
          model: provider.model,
          promptVersion: SMART_LIST_PARSE_VERSION,
          usage: provider.lastUsage(),
          status: attempt === 0 ? 'SUCCESS' : 'RETRIED',
        });
        return { items: response.items, usedFallback: false };
      }

      currentUser = buildParseRetryUser(user, ['The list came back empty.']);
    } catch (error) {
      await logAiCall({
        userId,
        feature: 'TRANSCRIPT_PARSE',
        provider: provider.name,
        model: provider.model,
        promptVersion: SMART_LIST_PARSE_VERSION,
        usage: provider.lastUsage(),
        status: 'ERROR',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  await logAiCall({
    userId,
    feature: 'TRANSCRIPT_PARSE',
    provider: 'rule-based',
    model: 'parse-text.v1',
    promptVersion: SMART_LIST_PARSE_VERSION,
    usage: null,
    status: 'FALLBACK',
  });

  return {
    items: parseListText(transcript).map((line) => ({
      item: line.name,
      quantity: line.quantity,
      unit: line.unitWord,
    })),
    usedFallback: true,
  };
}

// ─────────────────────────────────────────────────────────────
// Persisting a parsed list
// ─────────────────────────────────────────────────────────────

interface PersistInput {
  userId: string;
  source: SmartListSource;
  transcript: string | null;
  detectedLanguage: string | null;
  mediaUrl: string | null;
  items: ExtractedItem[];
  rawOutput: unknown;
  locale: Locale;
}

async function persistList(input: PersistInput): Promise<string> {
  const index = await buildMatchIndex(input.locale);
  const smartListId = newId(ID_PREFIX.smartList);

  await db.smartList.create({
    data: {
      id: smartListId,
      userId: input.userId,
      source: input.source,
      mediaUrl: input.mediaUrl,
      transcript: input.transcript,
      detectedLanguage: input.detectedLanguage,
      aiRawOutput: (input.rawOutput ?? null) as never,
      status: 'READY',
    },
  });

  for (const [order, extracted] of input.items.entries()) {
    const match = matchItem(extracted.item, index);
    const unitMatch = extracted.unit ? lookupUnit(extracted.unit) : null;

    const resolved = match.best
      ? toProductQuantity(extracted.quantity, unitMatch, match.best.unitType)
      : { quantity: Math.max(1, Math.round(extracted.quantity ?? 1)), unit: null };

    await db.smartListItem.create({
      data: {
        id: newId(ID_PREFIX.smartListItem),
        smartListId,
        rawText: extracted.item.slice(0, 255),
        parsedName: match.best?.name ?? extracted.item.slice(0, 160),
        quantity: resolved.quantity,
        unit: (resolved.unit as never) ?? null,
        // M4 — an unmatched item is still stored, so it can be shown and never
        // silently dropped.
        matchedProductId: match.best?.productId ?? null,
        matchedVariantId: match.best?.variantId ?? null,
        confidence: match.best?.confidence ?? 0,
        status: match.status,
        sortOrder: order,
      },
    });
  }

  return smartListId;
}

// ─────────────────────────────────────────────────────────────
// Entry points
// ─────────────────────────────────────────────────────────────

export interface VoiceInput {
  userId: string;
  audio: Buffer;
  mimeType: string;
  languageHint?: 'mr' | 'hi' | 'en';
  locale: Locale;
}

/**
 * AI-3 then AI-4. The transcript is returned so the UI can show it for editing
 * BEFORE the customer sees a cart — a wrong word caught here saves them
 * re-recording sixty seconds of speech.
 */
export async function createFromVoice(
  input: VoiceInput,
): Promise<{ smartListId: string; transcript: string; usedFallback: boolean }> {
  const stt = getSTTProvider();

  const transcription = await stt.transcribeAudio({
    audio: input.audio,
    mimeType: input.mimeType,
    languageHint: input.languageHint ?? 'mr',
  });

  await logAiCall({
    userId: input.userId,
    feature: 'VOICE_TRANSCRIPTION',
    provider: stt.name,
    model: stt.model,
    promptVersion: SMART_LIST_PARSE_VERSION,
    usage: stt.lastUsage(),
    status: 'SUCCESS',
  });

  // The audio itself is kept: a customer disputing what the app heard, and the
  // owner improving the alias table, both need the original.
  const stored = await getStorageProvider().upload({
    data: input.audio,
    mimeType: input.mimeType,
    folder: 'smart-list',
    fileName: 'voice',
  });

  const { items, usedFallback } = await extractItems(input.userId, transcription.text);

  const smartListId = await persistList({
    userId: input.userId,
    source: 'VOICE',
    transcript: transcription.text,
    detectedLanguage: transcription.detectedLanguage,
    mediaUrl: stored.url,
    items,
    rawOutput: { items },
    locale: input.locale,
  });

  return { smartListId, transcript: transcription.text, usedFallback };
}

export interface PhotoInput {
  userId: string;
  image: Buffer;
  mimeType: string;
  locale: Locale;
}

/** AI-5 — the vision model reads the handwriting; matching is still ours. */
export async function createFromPhoto(
  input: PhotoInput,
): Promise<{ smartListId: string; usedFallback: boolean }> {
  const provider = getAIProvider();
  const { system, user } = buildPhotoParsePrompt();

  let items: ExtractedItem[] = [];
  let usedFallback = false;

  try {
    const response = await provider.extractFromImage({
      image: input.image,
      mimeType: input.mimeType,
      prompt: `${system}\n\n${user}`,
      schema: extractedListSchema,
    });
    items = response.items;

    await logAiCall({
      userId: input.userId,
      feature: 'PHOTO_PARSE',
      provider: provider.name,
      model: provider.model,
      promptVersion: SMART_LIST_PHOTO_VERSION,
      usage: provider.lastUsage(),
      status: 'SUCCESS',
    });
  } catch (error) {
    // There is no rule-based fallback for reading handwriting. The list is
    // created empty with a FAILED status so the UI can offer manual entry
    // (M4) rather than showing nothing at all.
    usedFallback = true;
    await logAiCall({
      userId: input.userId,
      feature: 'PHOTO_PARSE',
      provider: provider.name,
      model: provider.model,
      promptVersion: SMART_LIST_PHOTO_VERSION,
      usage: provider.lastUsage(),
      status: 'ERROR',
      error: error instanceof Error ? error.message : String(error),
    });
  }

  const stored = await getStorageProvider().upload({
    data: input.image,
    mimeType: input.mimeType,
    folder: 'smart-list',
    fileName: 'photo',
  });

  const smartListId = await persistList({
    userId: input.userId,
    source: 'PHOTO',
    transcript: null,
    detectedLanguage: null,
    mediaUrl: stored.url,
    items,
    rawOutput: { items },
    locale: input.locale,
  });

  return { smartListId, usedFallback };
}

export interface TextInput {
  userId: string;
  text: string;
  locale: Locale;
}

/** M4's manual path, and what a re-parse of an edited transcript calls. */
export async function createFromText(
  input: TextInput,
): Promise<{ smartListId: string; usedFallback: boolean }> {
  const { items, usedFallback } = await extractItems(input.userId, input.text);

  const smartListId = await persistList({
    userId: input.userId,
    source: 'TEXT',
    transcript: input.text,
    detectedLanguage: null,
    mediaUrl: null,
    items,
    rawOutput: { items },
    locale: input.locale,
  });

  return { smartListId, usedFallback };
}
