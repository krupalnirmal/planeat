import { z } from 'zod';
import { ApiError, parseQuery, route } from '@/lib/api/handler';
import { ok } from '@/lib/api/response';
import { requireUser } from '@/lib/auth/session';
import { createFromPhoto } from '@/lib/smart-list/pipeline';
import { localeSchema } from '@/lib/validators/common';
import { IMAGE_MIME_TYPES, MAX_IMAGE_BYTES } from '@/lib/validators/smart-list';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const querySchema = z.object({ locale: localeSchema.default('mr') });

/**
 * POST /api/smart-list/photo — AI-5 (M4).
 *
 * There is no rule-based fallback for reading handwriting, so a vision failure
 * produces an EMPTY list rather than an error page: the review screen then
 * offers manual entry, which is M4's stated fallback. An error page would send
 * the customer back to a camera that is not the problem.
 */
export const POST = route(async (request: Request) => {
  const session = await requireUser();
  const { locale } = parseQuery(request, querySchema);

  const mimeType = (request.headers.get('content-type') ?? '').split(';')[0].trim();
  if (!(IMAGE_MIME_TYPES as readonly string[]).includes(mimeType)) {
    throw ApiError.badRequest(`Unsupported image type "${mimeType}"`);
  }

  const buffer = Buffer.from(await request.arrayBuffer());

  if (buffer.byteLength === 0) throw ApiError.badRequest('The photo was empty');
  if (buffer.byteLength > MAX_IMAGE_BYTES) {
    throw ApiError.badRequest('That photo is too large');
  }

  const result = await createFromPhoto({
    userId: session.userId,
    image: buffer,
    mimeType,
    locale,
  });

  return ok(
    { smartListId: result.smartListId, usedFallback: result.usedFallback },
    { status: 201 },
  );
});
