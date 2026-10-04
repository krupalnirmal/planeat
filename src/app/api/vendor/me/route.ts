import { route } from '@/lib/api/handler';
import { ok } from '@/lib/api/response';
import { requireVendor } from '@/lib/vendor/guard';
import { getMyBalance } from '@/lib/vendor/queries';

export const dynamic = 'force-dynamic';

/** GET /api/vendor/me — the vendor's own business name and balance owed. */
export const GET = route(async () => {
  const { businessName, vendorId } = await requireVendor();
  const balancePaise = await getMyBalance(vendorId);
  return ok({ businessName, balancePaise: balancePaise.toString() });
});
