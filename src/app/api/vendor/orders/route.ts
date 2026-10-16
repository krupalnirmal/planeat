import { ok } from '@/lib/api/response';
import { route } from '@/lib/api/handler';
import { requireVendor } from '@/lib/vendor/guard';
import { listVendorOrders } from '@/lib/vendor/orders';

export const dynamic = 'force-dynamic';

/** GET /api/vendor/orders — customer orders routed to this vendor to pack. */
export const GET = route(async () => {
  const { vendorId } = await requireVendor();
  const orders = await listVendorOrders(vendorId);
  return ok({ orders });
});
