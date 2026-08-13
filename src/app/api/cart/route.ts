import { z } from 'zod';
import { parseQuery, route } from '@/lib/api/handler';
import { ok } from '@/lib/api/response';
import { getSession } from '@/lib/auth/session';
import { getCart } from '@/lib/cart/queries';
import { localeSchema } from '@/lib/validators/common';

export const dynamic = 'force-dynamic';

const querySchema = z.object({ locale: localeSchema.default('mr') });

/**
 * GET /api/cart
 *
 * An empty cart for a guest, not a 401. B17 lets guests browse, and the cart
 * badge in the header is rendered on every page — a 401 there would paint an
 * error state over a completely normal situation.
 */
export const GET = route(async (request: Request) => {
  const { locale } = parseQuery(request, querySchema);
  const session = await getSession();

  if (!session) {
    return ok({ cart: { id: null, lines: [], itemCount: 0, itemTotalPaise: '0' }, guest: true });
  }

  const cart = await getCart(session.userId, locale);
  return ok({ cart, guest: false });
});
