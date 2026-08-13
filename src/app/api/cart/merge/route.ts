import { z } from 'zod';
import { parseJson, parseQuery, route } from '@/lib/api/handler';
import { ok } from '@/lib/api/response';
import { requireUser } from '@/lib/auth/session';
import { mergeGuestCart } from '@/lib/cart/queries';
import { mergeCartSchema } from '@/lib/validators/cart';
import { localeSchema } from '@/lib/validators/common';

export const dynamic = 'force-dynamic';

const querySchema = z.object({ locale: localeSchema.default('mr') });

/**
 * POST /api/cart/merge
 *
 * Called once, straight after OTP verification, with whatever the guest had in
 * localStorage. Takes the larger quantity per variant rather than summing —
 * summing double-counts the same person adding the same item on two devices.
 *
 * Safe to call twice: a second call with the same lines is a no-op, because
 * max(existing, incoming) is idempotent.
 */
export const POST = route(async (request: Request) => {
  const session = await requireUser();
  const { locale } = parseQuery(request, querySchema);
  const { lines } = await parseJson(request, mergeCartSchema);

  const cart = await mergeGuestCart(session.userId, lines, locale);
  return ok({ cart });
});
