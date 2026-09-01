import { ApiError, route } from '@/lib/api/handler';
import { ok } from '@/lib/api/response';
import { requireUser } from '@/lib/auth/session';
import { getOrderPaymentStatus } from '@/lib/orders/pay';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

/**
 * GET /api/orders/:id/pay/status
 *
 * What the checkout screen polls after the gateway's callback fires. A
 * READ — polling this never marks anything paid, so a customer refreshing
 * it repeatedly (or closing the browser mid-payment and coming back)
 * changes nothing; the order is simply correct whenever they next check.
 */
export const GET = route(async (_request: Request, context: Context) => {
  const session = await requireUser();
  const { id } = await context.params;

  const status = await getOrderPaymentStatus(id, session.userId);
  if (!status) throw ApiError.notFound('Order not found');

  return ok(status);
});
