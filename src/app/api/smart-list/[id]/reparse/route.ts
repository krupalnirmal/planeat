import { z } from 'zod';
import { ApiError, parseJson, parseQuery, route } from '@/lib/api/handler';
import { ok } from '@/lib/api/response';
import { requireUser } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { createFromText } from '@/lib/smart-list/pipeline';
import { localeSchema } from '@/lib/validators/common';
import { reparseSchema } from '@/lib/validators/smart-list';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const querySchema = z.object({ locale: localeSchema.default('mr') });

type Context = { params: Promise<{ id: string }> };

/**
 * POST /api/smart-list/:id/reparse — M4's editable transcript.
 *
 * Speech-to-text on a Marathi voice note in a noisy market gets a word wrong
 * often enough that this is a core path, not an edge case. The customer fixes
 * the word and re-parses; they never re-record sixty seconds of speech.
 *
 * A re-parse creates a NEW list rather than mutating the old one. The original
 * transcript and audio are what the owner needs to work out which alias was
 * missing — overwriting them would destroy the only evidence.
 */
export const POST = route(async (request: Request, context: Context) => {
  const session = await requireUser();
  const { id } = await context.params;
  const { locale } = parseQuery(request, querySchema);
  const { transcript } = await parseJson(request, reparseSchema);

  const original = await db.smartList.findUnique({
    where: { id },
    select: { userId: true, name: true },
  });

  if (!original || original.userId !== session.userId) {
    throw ApiError.notFound('That list was not found');
  }

  const result = await createFromText({ userId: session.userId, text: transcript, locale });

  return ok({ smartListId: result.smartListId, usedFallback: result.usedFallback });
});
