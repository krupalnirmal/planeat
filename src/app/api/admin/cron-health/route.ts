import { parseJson, route } from '@/lib/api/handler';
import { ok } from '@/lib/api/response';
import { STORE_ROLES, requireRole } from '@/lib/auth/session';
import { getCronHealth } from '@/lib/subscription/daily-jobs';
import { generateDailyOrders } from '@/lib/subscription/generate-orders';
import { regenerateSchema } from '@/lib/validators/subscription';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * M6's reliability requirement:
 *
 *   "admin dashboard alerts if today's generated order count is zero, plus a
 *    manual 'regenerate today' button. A silent cron failure means nobody gets
 *    vegetables."
 *
 * GET is the alert; POST is the button. Both are RBAC-guarded (R9). The button
 * runs exactly the same job as the cron — authorised by an admin session
 * instead of the cron secret — so there is no second code path that could
 * behave differently on the morning it matters.
 *
 * The dashboard that renders this arrives in Phase 8; the mechanism belongs
 * with the job it watches.
 */
export const GET = route(async () => {
  await requireRole(...STORE_ROLES);
  return ok(await getCronHealth());
});

export const POST = route(async (request: Request) => {
  const session = await requireRole(...STORE_ROLES);
  const input = await parseJson(request, regenerateSchema);

  const result = await generateDailyOrders({ targetDate: input.date });

  console.info(
    `[admin] ${session.userId} reran daily generation for ${result.targetDate}:`,
    `${result.created} created, ${result.duplicates} already existed`,
  );

  return ok(result);
});
