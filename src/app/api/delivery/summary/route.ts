import { route } from '@/lib/api/handler';
import { ok } from '@/lib/api/response';
import { getDailySummary } from '@/lib/delivery/queries';
import { requireDeliveryPartner } from '@/lib/delivery/guard';

export const dynamic = 'force-dynamic';

/** GET /api/delivery/summary — "Daily summary including COD cash collected" (M10). */
export const GET = route(async () => {
  const { partnerId } = await requireDeliveryPartner();
  const summary = await getDailySummary(partnerId);
  return ok({ summary });
});
