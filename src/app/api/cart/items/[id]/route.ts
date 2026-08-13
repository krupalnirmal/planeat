import { z } from 'zod';
import { ApiError, parseJson, parseQuery, route } from '@/lib/api/handler';
import { ok } from '@/lib/api/response';
import { requireUser } from '@/lib/auth/session';
import { removeCartLine, setCartLineQuantity } from '@/lib/cart/queries';
import { updateCartItemSchema } from '@/lib/validators/cart';
import { localeSchema } from '@/lib/validators/common';

export const dynamic = 'force-dynamic';

const querySchema = z.object({ locale: localeSchema.default('mr') });

type Context = { params: Promise<{ id: string }> };

/** PATCH /api/cart/items/:id — the stepper. Quantity 0 removes the line. */
export const PATCH = route(async (request: Request, context: Context) => {
  const session = await requireUser();
  const { id } = await context.params;
  const { locale } = parseQuery(request, querySchema);
  const { quantity } = await parseJson(request, updateCartItemSchema);

  // R9 — ownership is checked inside the query, not by trusting the id.
  const cart = await setCartLineQuantity(session.userId, id, quantity, locale);
  if (!cart) throw ApiError.notFound('Cart item not found');

  return ok({ cart });
});

export const DELETE = route(async (request: Request, context: Context) => {
  const session = await requireUser();
  const { id } = await context.params;
  const { locale } = parseQuery(request, querySchema);

  const cart = await removeCartLine(session.userId, id, locale);
  if (!cart) throw ApiError.notFound('Cart item not found');

  return ok({ cart });
});
