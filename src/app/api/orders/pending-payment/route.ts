import { route } from '@/lib/api/handler';
import { ok } from '@/lib/api/response';
import { requireUser } from '@/lib/auth/session';
import { getPendingPaymentOrder } from '@/lib/orders/queries';

export const dynamic = 'force-dynamic';

/**
 * GET /api/orders/pending-payment — surfaced on an empty cart (M3, session
 * 2026-10-01). See `getPendingPaymentOrder`'s own doc comment for why this
 * exists: placeOrder reserves stock and clears the cart before a RAZORPAY
 * checkout ever opens, so abandoning that checkout leaves a real order
 * stuck PENDING with no trace anywhere else in the app.
 */
export const GET = route(async () => {
  const session = await requireUser();
  const order = await getPendingPaymentOrder(session.userId);

  return ok({
    order: order && {
      id: order.id,
      orderNumber: order.orderNumber,
      totalPaise: order.totalPaise.toString(),
    },
  });
});
