import { parseJson, route } from '@/lib/api/handler';
import { ok } from '@/lib/api/response';
import { setAvailability } from '@/lib/delivery/availability';
import { requireDeliveryPartner } from '@/lib/delivery/guard';
import { availabilitySchema } from '@/lib/validators/delivery';

export const dynamic = 'force-dynamic';

/** PATCH /api/delivery/availability — the rider's own on/off toggle (M10). */
export const PATCH = route(async (request: Request) => {
  const { partnerId } = await requireDeliveryPartner();
  const { isAvailable } = await parseJson(request, availabilitySchema);

  await setAvailability(partnerId, isAvailable);
  return ok({ isAvailable });
});
