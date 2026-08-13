import { z } from 'zod';
import { ApiError, parseQuery, route } from '@/lib/api/handler';
import { ok } from '@/lib/api/response';
import { requireUser } from '@/lib/auth/session';
import { createFromVoice } from '@/lib/smart-list/pipeline';
import { localeSchema } from '@/lib/validators/common';
import {
  AUDIO_MIME_TYPES,
  MAX_AUDIO_BYTES,
  languageHintSchema,
} from '@/lib/validators/smart-list';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const querySchema = z.object({
  locale: localeSchema.default('mr'),
  languageHint: languageHintSchema,
});

/**
 * POST /api/smart-list/voice — AI-3 then AI-4 (M4).
 *
 * Takes the raw audio as the request body rather than multipart: the browser
 * sends one blob from MediaRecorder, and a form wrapper around a single file
 * buys nothing but parsing.
 *
 * The response carries the TRANSCRIPT, because M4 shows it for editing before
 * the customer sees a cart. A single misheard word costs one tap here and a
 * re-recorded sixty seconds otherwise.
 */
export const POST = route(async (request: Request) => {
  const session = await requireUser();
  const { locale, languageHint } = parseQuery(request, querySchema);

  const mimeType = (request.headers.get('content-type') ?? '').split(';')[0].trim();
  if (!(AUDIO_MIME_TYPES as readonly string[]).includes(mimeType)) {
    throw ApiError.badRequest(`Unsupported audio type "${mimeType}"`);
  }

  const buffer = Buffer.from(await request.arrayBuffer());

  if (buffer.byteLength === 0) throw ApiError.badRequest('The recording was empty');

  // M4 caps recordings at 60 seconds. The client enforces it with a timer;
  // this enforces it against a client that lies, and against a phone that
  // produced a much larger file than expected.
  if (buffer.byteLength > MAX_AUDIO_BYTES) {
    throw ApiError.badRequest('That recording is too long');
  }

  const result = await createFromVoice({
    userId: session.userId,
    audio: buffer,
    mimeType,
    languageHint,
    locale,
  });

  return ok(
    {
      smartListId: result.smartListId,
      transcript: result.transcript,
      usedFallback: result.usedFallback,
    },
    { status: 201 },
  );
});
