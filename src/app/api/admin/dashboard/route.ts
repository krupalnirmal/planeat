import { z } from 'zod';
import { parseQuery, route } from '@/lib/api/handler';
import { ok } from '@/lib/api/response';
import { getDashboardMetrics } from '@/lib/admin/dashboard';
import { requireStoreAdmin } from '@/lib/admin/guard';
import { localeSchema } from '@/lib/validators/common';

export const dynamic = 'force-dynamic';

const querySchema = z.object({ locale: localeSchema.default('en') });

/**
 * GET /api/admin/dashboard (M9).
 *
 * Two of these numbers are alarms rather than statistics: `unreviewedFlaggedPlans`
 * (B8) and `cron.alert` (M6). Everything else is context — including
 * `analytics`, the charts' data (session 2026-09-17).
 */
export const GET = route(async (request: Request) => {
  await requireStoreAdmin();
  const { locale } = parseQuery(request, querySchema);
  return ok(await getDashboardMetrics(new Date(), locale));
});
