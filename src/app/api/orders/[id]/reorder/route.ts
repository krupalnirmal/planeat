import { z } from 'zod';
import { ApiError, parseQuery, route } from '@/lib/api/handler';
import { ok } from '@/lib/api/response';
import { requireUser } from '@/lib/auth/session';
import { addToCart } from '@/lib/cart/queries';
import { getReorderLines } from '@/lib/orders/queries';
import { localeSchema } from '@/lib/validators/common';

export const dynamic = 'force-dynamic';

const querySchema = z.object({ locale: localeSchema.default('mr') });

/**
 * POST /api/orders/:id/reorder — refills the cart from a past order (M3).
 *
 * Adds what is still sellable and reports what is not. Silently dropping two
 * of five items and calling it a reorder is how somebody ends up cooking
 * without onions.
 */
export const POST = route(async (request: Request, context: { params: Promise<{ id: string }> }) => {
  const session = await requireUser();
  const { id } = await context.params;
  const { locale } = parseQuery(request, querySchema);

  const lines = await getReorderLines(id, session.userId);
  if (!lines) throw ApiError.notFound('Order not found');

  const skipped = [...lines.unavailable];
  let added = 0;

  for (const line of lines.available) {
    const result = await addToCart(
      session.userId,
      { variantId: line.variantId, quantity: line.quantity },
      locale,
    );
    // Stock can run out between the availability read and this write; that is
    // a skip, not a failure of the whole reorder.
    if (result.ok) added += 1;
    else skipped.push({ name: line.variantId, reason: 'OUT_OF_STOCK' });
  }

  return ok({ added, skipped });
});
