import { route } from '@/lib/api/handler';
import { ok } from '@/lib/api/response';
import { requireUser } from '@/lib/auth/session';
import { getCurrentSubscription, getWeekSchedule } from '@/lib/subscription/queries';

export const dynamic = 'force-dynamic';

/**
 * GET /api/subscriptions/current
 *
 * The subscription plus M6's "My Week" in one response, because the meal-plan
 * tab renders both together and two round trips to Singapore for one screen is
 * one too many.
 *
 * Returns null rather than 404 when there is none — most customers have no
 * subscription, and that is a normal state the tab renders as a call to action.
 */
export const GET = route(async () => {
  const session = await requireUser();

  const subscription = await getCurrentSubscription(session.userId);
  if (!subscription) return ok({ subscription: null, week: null });

  const week = await getWeekSchedule(subscription.id, session.userId);

  return ok({ subscription, week });
});
