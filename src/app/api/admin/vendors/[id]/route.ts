import { ApiError, clientIp, parseJson, route } from '@/lib/api/handler';
import { ok } from '@/lib/api/response';
import { requireStoreAdmin } from '@/lib/admin/guard';
import { getVendorDetail, listVendorSupplies, setVendorActive, updateVendor } from '@/lib/admin/vendors';
import { updateVendorSchema } from '@/lib/validators/admin';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

/** GET /api/admin/vendors/:id — vendor profile + supply history. */
export const GET = route(async (_request: Request, context: Context) => {
  await requireStoreAdmin();
  const { id } = await context.params;

  const vendor = await getVendorDetail(id);
  if (!vendor) throw ApiError.notFound('Vendor not found');

  const supplies = await listVendorSupplies(id);

  return ok({
    vendor: { ...vendor, balancePaise: vendor.balancePaise.toString() },
    supplies: supplies.map((s) => ({ ...s, costPricePaise: s.costPricePaise.toString() })),
  });
});

/** PATCH /api/admin/vendors/:id — deactivate/reactivate a supplier, and/or
    change its packing service area. */
export const PATCH = route(async (request: Request, context: Context) => {
  const session = await requireStoreAdmin();
  const { id } = await context.params;
  const input = await parseJson(request, updateVendorSchema);
  const ip = clientIp(request);

  if (input.isActive !== undefined) {
    const result = await setVendorActive(id, input.isActive, session.userId, ip);
    if (!result.ok) throw ApiError.notFound('Vendor not found');
  }

  if (input.serviceAreaId !== undefined) {
    const result = await updateVendor(id, { serviceAreaId: input.serviceAreaId }, session.userId, ip);
    if (!result.ok) throw ApiError.notFound('Vendor not found');
  }

  return ok({ vendorId: id });
});
