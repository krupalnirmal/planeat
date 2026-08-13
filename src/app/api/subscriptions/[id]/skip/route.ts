import { ApiError, parseJson, route } from '@/lib/api/handler';
import { ok } from '@/lib/api/response';
import { requireUser } from '@/lib/auth/session';
import { skipDay, unskipDay } from '@/lib/subscription/manage';
import { skipDaySchema } from '@/lib/validators/subscription';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

/**
 * POST /api/subscriptions/:id/skip
 *
 * M6 — "Skip a day (before 20:00 previous day)." Past the cutoff the picklist
 * is being prepared and the preview has gone out with tomorrow's exact bill,
 * so a skip would mean vegetables already weighed for somebody who is no
 * longer expecting them.
 *
 * PART 12 — "Skipping a day prevents generation for that date only." The
 * exception row is per-date; the subscription carries on around it.
 */
export const POST = route(async (request: Request, context: Context) => {
  const session = await requireUser();
  const { id } = await context.params;
  const input = await parseJson(request, skipDaySchema);

  const result = input.undo
    ? await unskipDay(id, session.userId, input.date)
    : await skipDay(id, session.userId, input.date);

  if (result.ok) return ok({ date: result.dateKey, skipped: !input.undo });

  switch (result.reason) {
    case 'NOT_FOUND':
      throw ApiError.notFound('Subscription not found');
    case 'OUTSIDE_PERIOD':
      throw ApiError.badRequest('That date is outside your plan period');
    case 'ALREADY_GENERATED':
      throw ApiError.conflict("That day's order has already been prepared");
    case 'TOO_LATE':
      throw ApiError.conflict('It is too late to change that day');
  }
});
