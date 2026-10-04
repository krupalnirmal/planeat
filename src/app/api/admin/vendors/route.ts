import { ApiError, clientIp, parseJson, route } from '@/lib/api/handler';
import { ok } from '@/lib/api/response';
import { requireStoreAdmin } from '@/lib/admin/guard';
import { createVendor, listVendors } from '@/lib/admin/vendors';
import { createVendorSchema } from '@/lib/validators/admin';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/** GET /api/admin/vendors — list, with balance owed and pending-supply count. */
export const GET = route(async () => {
  await requireStoreAdmin();
  const vendors = await listVendors();
  return ok({
    vendors: vendors.map((v) => ({ ...v, balancePaise: v.balancePaise.toString() })),
  });
});

/** POST /api/admin/vendors — the owner adding a new supplier. */
export const POST = route(async (request: Request) => {
  const session = await requireStoreAdmin();
  const input = await parseJson(request, createVendorSchema);

  const result = await createVendor(input, session.userId, clientIp(request));

  if (!result.ok) {
    throw ApiError.conflict('That phone number already has an account.');
  }

  return ok({ vendorId: result.vendorId });
});
