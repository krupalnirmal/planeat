import { z } from 'zod';
import { cuidSchema } from './common';

/** M4 — Smart List inputs. */

/** M4 — "record (max 60s)". Enforced server-side too: a client can lie. */
export const MAX_AUDIO_BYTES = 8 * 1024 * 1024;
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

export const AUDIO_MIME_TYPES = [
  'audio/webm',
  'audio/ogg',
  'audio/mpeg',
  'audio/mp4',
  'audio/wav',
  'audio/x-m4a',
] as const;

export const IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

export const smartListTextSchema = z.object({
  text: z.string().trim().min(2).max(4000),
});
export type SmartListTextInput = z.infer<typeof smartListTextSchema>;

/**
 * M4 — the transcript is EDITABLE before parsing. A re-parse is the customer
 * saying "you misheard one word", which is far cheaper than re-recording.
 */
export const reparseSchema = z.object({
  transcript: z.string().trim().min(2).max(4000),
});

export const updateSmartListItemSchema = z.object({
  /** Choosing one of the top-3 alternatives on an ambiguous row. */
  productId: cuidSchema.nullable().optional(),
  variantId: cuidSchema.nullable().optional(),
  quantity: z.coerce.number().int().min(1).max(100_000).optional(),
  /** Removing a line the customer does not want. */
  remove: z.boolean().optional(),
});
export type UpdateSmartListItemInput = z.infer<typeof updateSmartListItemSchema>;

/** M4 — "Saved lists — name and reuse ('Weekly Sabzi')." */
export const renameSmartListSchema = z.object({
  name: z.string().trim().min(1).max(120),
});

export const languageHintSchema = z.enum(['mr', 'hi', 'en']).default('mr');
