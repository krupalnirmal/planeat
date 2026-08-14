import { z } from 'zod';
import { parseQuery, route } from '@/lib/api/handler';
import { ok } from '@/lib/api/response';
import { getSession } from '@/lib/auth/session';
import { getPreviouslyBought } from '@/lib/catalog/queries';
import { localeSchema } from '@/lib/validators/common';

export const dynamic = 'force-dynamic';

const querySchema = z.object({ locale: localeSchema.default('mr') });

/**
 * GET /api/orders/previously-bought — the "Order again" rail on home.
 *
 * An empty list for a guest rather than a 401, same reasoning as `/api/cart`
 * (B17): the home screen renders this for everybody, and a 401 would turn a
 * completely normal "not logged in" into an error state.
 */
export const GET = route(async (request: Request) => {
  const { locale } = parseQuery(request, querySchema);
  const session = await getSession();

  if (!session) return ok({ products: [] });

  const products = await getPreviouslyBought(session.userId, locale);
  return ok({ products });
});
