import { ApiError, parseJson, route } from '@/lib/api/handler';
import { ok } from '@/lib/api/response';
import { requireUser } from '@/lib/auth/session';
import { pauseSubscription } from '@/lib/subscription/manage';
import { pauseSchema } from '@/lib/validators/subscription';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

/**
 * POST /api/subscriptions/:id/pause — M6, pause a date range.
 *
 * A pause writes one exception per date rather than introducing a new concept
 * the 00:30 job would have to learn. That job already refuses any date with an
 * exception, so pausing adds nothing to the part that must not break.
 */
export const POST = route(async (request: Request, context: Context) => {
  const session = await requireUser();
  const { id } = await context.params;
  const input = await parseJson(request, pauseSchema);

  const result = await pauseSubscription(id, session.userId, input.fromDate, input.toDate);

  if (result.ok) return ok({ paused: true, days: result.days });

  switch (result.reason) {
    case 'NOT_FOUND':
      throw ApiError.notFound('Subscription not found');
    case 'INVALID_RANGE':
      throw ApiError.badRequest('The end date is before the start date');
    case 'TOO_LATE':
      throw ApiError.conflict('It is too late to pause from that date');
  }
});
