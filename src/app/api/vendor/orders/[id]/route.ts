import { ApiError, route } from '@/lib/api/handler';
import { ok } from '@/lib/api/response';
import { requireVendor } from '@/lib/vendor/guard';
import { getVendorOrderDetail } from '@/lib/vendor/orders';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

/** GET /api/vendor/orders/:id — ownership-gated: another vendor's order 404s. */
export const GET = route(async (_request: Request, context: Context) => {
  const { vendorId } = await requireVendor();
  const { id } = await context.params;

  const order = await getVendorOrderDetail(vendorId, id);
  if (!order) throw ApiError.notFound('Order not found');

  return ok({ order });
});
