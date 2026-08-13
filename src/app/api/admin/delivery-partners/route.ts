import { ApiError, clientIp, parseJson, route } from '@/lib/api/handler';
import { ok } from '@/lib/api/response';
import { requireStoreAdmin } from '@/lib/admin/guard';
import { createDeliveryPartner, listDeliveryPartners } from '@/lib/admin/delivery-partners';
import { createDeliveryPartnerSchema } from '@/lib/validators/admin';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/** GET /api/admin/delivery-partners — CRUD, availability, load (M9). */
export const GET = route(async () => {
  await requireStoreAdmin();
  const partners = await listDeliveryPartners();
  return ok({ partners });
});

/** POST /api/admin/delivery-partners — the owner adding a new rider. */
export const POST = route(async (request: Request) => {
  const session = await requireStoreAdmin();
  const input = await parseJson(request, createDeliveryPartnerSchema);

  const result = await createDeliveryPartner(
    { ...input, serviceAreaId: input.serviceAreaId ?? null },
    session.userId,
    clientIp(request),
  );

  if (!result.ok) {
    throw ApiError.conflict('That phone number already has an account.');
  }

  return ok({ partnerId: result.partnerId });
});
