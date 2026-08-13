import { route } from '@/lib/api/handler';
import { ok } from '@/lib/api/response';
import { requireDeliveryPartner } from '@/lib/delivery/guard';

export const dynamic = 'force-dynamic';

/** GET /api/delivery/me — the rider's own name and current availability. */
export const GET = route(async () => {
  const { name, isAvailable } = await requireDeliveryPartner();
  return ok({ name, isAvailable });
});
