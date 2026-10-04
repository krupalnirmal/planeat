import { route } from '@/lib/api/handler';
import { ok } from '@/lib/api/response';
import { requireVendor } from '@/lib/vendor/guard';
import { listSuppliableVariants } from '@/lib/vendor/queries';

export const dynamic = 'force-dynamic';

/** GET /api/vendor/products — active product variants a vendor can report a supply against. */
export const GET = route(async () => {
  await requireVendor();
  const variants = await listSuppliableVariants();
  return ok({ variants });
});
