import { route } from '@/lib/api/handler';
import { ok } from '@/lib/api/response';
import { requireStoreAdmin } from '@/lib/admin/guard';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/service-areas — a read-only list, just for the delivery
 * partner form's "which area does this rider cover" dropdown. Creating and
 * editing service areas is a rare, high-stakes change (B11's pincode
 * allow-list) better made directly against the database than through a form
 * with no confirmation step — this endpoint does not write.
 */
export const GET = route(async () => {
  await requireStoreAdmin();
  const areas = await db.serviceArea.findMany({
    where: { isActive: true },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, pincode: true },
  });
  return ok({ areas });
});
