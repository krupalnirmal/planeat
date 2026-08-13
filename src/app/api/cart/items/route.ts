import { z } from 'zod';
import { ApiError, parseJson, parseQuery, route } from '@/lib/api/handler';
import { ERROR_CODES, ok } from '@/lib/api/response';
import { requireUser } from '@/lib/auth/session';
import { addToCart } from '@/lib/cart/queries';
import { addCartItemSchema } from '@/lib/validators/cart';
import { localeSchema } from '@/lib/validators/common';

export const dynamic = 'force-dynamic';

const querySchema = z.object({ locale: localeSchema.default('mr') });

/**
 * POST /api/cart/items
 *
 * B17 — login is required at add-to-cart, which is exactly the commitment
 * point. Guests keep a localStorage cart and merge it in when they log in.
 */
export const POST = route(async (request: Request) => {
  const session = await requireUser();
  const { locale } = parseQuery(request, querySchema);
  const input = await parseJson(request, addCartItemSchema);

  const result = await addToCart(session.userId, input, locale);

  if (!result.ok) {
    if (result.reason === 'INSUFFICIENT_STOCK') {
      throw new ApiError(ERROR_CODES.OUT_OF_STOCK, 'Not enough stock left', 409, {
        availableQty: result.availableQty,
      });
    }
    if (result.reason === 'VARIANT_NOT_FOUND') throw ApiError.notFound('Product not found');
    throw new ApiError(ERROR_CODES.OUT_OF_STOCK, 'This product is unavailable', 409);
  }

  return ok({ cart: result.cart });
});
