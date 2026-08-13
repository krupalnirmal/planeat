import { route } from '@/lib/api/handler';
import { ok } from '@/lib/api/response';
import { getDashboardMetrics } from '@/lib/admin/dashboard';
import { requireStoreAdmin } from '@/lib/admin/guard';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/dashboard (M9).
 *
 * Two of these numbers are alarms rather than statistics: `unreviewedFlaggedPlans`
 * (B8) and `cron.alert` (M6). Everything else is context.
 */
export const GET = route(async () => {
  await requireStoreAdmin();
  return ok(await getDashboardMetrics());
});
