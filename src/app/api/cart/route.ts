import { z } from 'zod';
import { parseQuery, route } from '@/lib/api/handler';
import { ok } from '@/lib/api/response';
import { getSession } from '@/lib/auth/session';
import { getCart } from '@/lib/cart/queries';
import { loadFeeConfig } from '@/lib/orders/pricing';
import { localeSchema } from '@/lib/validators/common';

export const dynamic = 'force-dynamic';

const querySchema = z.object({ locale: localeSchema.default('mr') });

/**
 * GET /api/cart
 *
 * An empty cart for a guest, not a 401. B17 lets guests browse, and the cart
 * badge in the header is rendered on every page — a 401 there would paint an
 * error state over a completely normal situation.
 *
 * The response carries the B10 free-delivery gap alongside the cart, so the
 * floating cart bar can show "add ₹X more for free delivery" without the
 * client owning a copy of that rule (R8) or calling the checkout quote on
 * every screen just to render one line.
 */
export const GET = route(async (request: Request) => {
  const { locale } = parseQuery(request, querySchema);
  const session = await getSession();
  const fees = await loadFeeConfig();

  if (!session) {
    return ok({
      cart: { id: null, lines: [], itemCount: 0, itemTotalPaise: '0' },
      guest: true,
      // A guest cart holds quantities only, never prices (D-56), so there is
      // no total to measure the threshold against — the nudge starts once
      // they log in and the server cart has real money in it.
      amountForFreeDeliveryPaise: '0',
      freeDeliveryThresholdPaise: fees.freeDeliveryThresholdPaise.toString(),
    });
  }

  const cart = await getCart(session.userId, locale);
  const gap =
    cart.itemTotalPaise > 0n && cart.itemTotalPaise < fees.freeDeliveryThresholdPaise
      ? fees.freeDeliveryThresholdPaise - cart.itemTotalPaise
      : 0n;

  return ok({
    cart,
    guest: false,
    amountForFreeDeliveryPaise: gap.toString(),
    freeDeliveryThresholdPaise: fees.freeDeliveryThresholdPaise.toString(),
  });
});
