import { route } from '@/lib/api/handler';
import { ok } from '@/lib/api/response';
import { requireStoreAdmin } from '@/lib/admin/guard';
import { getWaitlistByPincode } from '@/lib/admin/dashboard';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/waitlist — B11's demand map.
 *
 *   "Admin dashboard shows waitlist demand grouped by pincode — that is how
 *    the owner decides where to expand."
 *
 * Grouped rather than listed, because the question this screen answers is
 * "where should we go next", not "who signed up".
 */
export const GET = route(async () => {
  await requireStoreAdmin();
  return ok({ pincodes: await getWaitlistByPincode() });
});
