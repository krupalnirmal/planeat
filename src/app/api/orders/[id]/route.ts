import { ApiError, route } from '@/lib/api/handler';
import { ok } from '@/lib/api/response';
import { requireUser } from '@/lib/auth/session';
import { getOrderDetail } from '@/lib/orders/queries';
import { isCustomerCancellable, isIssueReportable, timelineIndex } from '@/lib/orders/status';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

/**
 * GET /api/orders/:id
 *
 * The status predicates are computed here rather than in the client, so the
 * cancel button appearing and the cancel actually being allowed can never
 * disagree.
 */
export const GET = route(async (_request: Request, context: Context) => {
  const session = await requireUser();
  const { id } = await context.params;

  const order = await getOrderDetail(id, session.userId);
  if (!order) throw ApiError.notFound('Order not found');

  return ok({
    order,
    canCancel: isCustomerCancellable(order.status),
    canReportIssue: isIssueReportable(order.status),
    timelineIndex: timelineIndex(order.status),
  });
});
