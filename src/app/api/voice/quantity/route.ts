import { z } from 'zod';
import { logAiCall } from '@/lib/ai/logger';
import { ApiError, parseQuery, route } from '@/lib/api/handler';
import { ok } from '@/lib/api/response';
import { requireUser } from '@/lib/auth/session';
import { getSTTProvider } from '@/lib/services/ai';
import { AUDIO_MIME_TYPES, MAX_AUDIO_BYTES, languageHintSchema } from '@/lib/validators/smart-list';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const querySchema = z.object({ languageHint: languageHintSchema });

/**
 * POST /api/voice/quantity — transcription only, for the category row's
 * "say a quantity" mic.
 *
 * Deliberately NOT `createFromVoice`: that pipeline runs a second AI call to
 * split a whole grocery list into items and persists a `SmartList` row,
 * neither of which applies to "एक अडीच किलो" said about a single product
 * already on screen. Parsing the number back out of the transcript happens
 * client-side with the same deterministic parser Smart List falls back to
 * (`parseVoiceQuantity`), so this route's only job is speech-to-text.
 */
export const POST = route(async (request: Request) => {
  const session = await requireUser();
  const { languageHint } = parseQuery(request, querySchema);

  const mimeType = (request.headers.get('content-type') ?? '').split(';')[0].trim();
  if (!(AUDIO_MIME_TYPES as readonly string[]).includes(mimeType)) {
    throw ApiError.badRequest(`Unsupported audio type "${mimeType}"`);
  }

  const buffer = Buffer.from(await request.arrayBuffer());
  if (buffer.byteLength === 0) throw ApiError.badRequest('The recording was empty');
  if (buffer.byteLength > MAX_AUDIO_BYTES) throw ApiError.badRequest('That recording is too long');

  const stt = getSTTProvider();
  const transcription = await stt.transcribeAudio({
    audio: buffer,
    mimeType,
    languageHint,
  });

  await logAiCall({
    userId: session.userId,
    feature: 'VOICE_TRANSCRIPTION',
    provider: stt.name,
    model: stt.model,
    promptVersion: 'voice-quantity.v1',
    usage: stt.lastUsage(),
    status: 'SUCCESS',
  });

  return ok({ transcript: transcription.text });
});
