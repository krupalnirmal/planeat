import { ApiError, clientIp, parseJson, route } from '@/lib/api/handler';
import { ok } from '@/lib/api/response';
import { requireStoreAdmin } from '@/lib/admin/guard';
import { updateDeliveryPartner } from '@/lib/admin/delivery-partners';
import { updateDeliveryPartnerSchema } from '@/lib/validators/admin';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

/** PATCH /api/admin/delivery-partners/:id — vehicle, area, availability (M9). */
export const PATCH = route(async (request: Request, context: Context) => {
  const session = await requireStoreAdmin();
  const { id } = await context.params;
  const input = await parseJson(request, updateDeliveryPartnerSchema);

  const result = await updateDeliveryPartner(id, input, session.userId, clientIp(request));
  if (!result.ok) throw ApiError.notFound('Delivery partner not found');

  return ok({ partnerId: id });
});
