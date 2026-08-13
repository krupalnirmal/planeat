import { ApiError, parseQuery, route } from '@/lib/api/handler';
import { ok } from '@/lib/api/response';
import { requireUser } from '@/lib/auth/session';
import { getWeekSchedule } from '@/lib/subscription/queries';
import { scheduleQuerySchema } from '@/lib/validators/subscription';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

/** GET /api/subscriptions/:id/schedule — My Week, or any window up to a month. */
export const GET = route(async (request: Request, context: Context) => {
  const session = await requireUser();
  const { id } = await context.params;
  const { days } = parseQuery(request, scheduleQuerySchema);

  // R9 — ownership is checked inside the query.
  const week = await getWeekSchedule(id, session.userId, days);
  if (!week) throw ApiError.notFound('Subscription not found');

  return ok(week);
});
