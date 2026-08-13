import { ApiError, route } from '@/lib/api/handler';
import { ok } from '@/lib/api/response';
import { requireDeliveryPartner } from '@/lib/delivery/guard';
import { getAssignmentDetail } from '@/lib/delivery/queries';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

/** GET /api/delivery/orders/:id — the order detail a rider needs at the door (M10). */
export const GET = route(async (_request: Request, context: Context) => {
  const { partnerId } = await requireDeliveryPartner();
  const { id: orderId } = await context.params;

  const order = await getAssignmentDetail(partnerId, orderId);
  if (!order) throw ApiError.notFound('No assignment found for that order');

  return ok({ order });
});
