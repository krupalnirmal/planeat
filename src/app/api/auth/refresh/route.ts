import { ApiError, route } from '@/lib/api/handler';
import { ok } from '@/lib/api/response';
import { rotateSession } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

/**
 * POST /api/auth/refresh
 *
 * Rotates the refresh token and reissues both cookies. Presenting a token that
 * has already been rotated revokes every session for that user — that pattern
 * means the token was stolen, and the honest user re-logging in is a far
 * cheaper outcome than leaving the thief inside.
 */
export const POST = route(async () => {
  const rotated = await rotateSession();
  if (!rotated) throw ApiError.unauthorized('Session expired, please log in again');
  return ok({ refreshed: true });
});
