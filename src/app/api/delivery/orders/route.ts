import { route } from '@/lib/api/handler';
import { ok } from '@/lib/api/response';
import { requireDeliveryPartner } from '@/lib/delivery/guard';
import { listTodayAssignments } from '@/lib/delivery/queries';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/** GET /api/delivery/orders — "Today's assigned orders sorted by slot" (M10). */
export const GET = route(async () => {
  const { partnerId } = await requireDeliveryPartner();
  const orders = await listTodayAssignments(partnerId);
  return ok({ orders });
});
