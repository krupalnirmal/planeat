import { route } from '@/lib/api/handler';
import { ok } from '@/lib/api/response';
import { endSession } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

/** POST /api/auth/logout — revokes the refresh token and clears both cookies. */
export const POST = route(async () => {
  await endSession();
  return ok({ loggedOut: true });
});
