import { ApiError, clientIp, parseJson, route } from '@/lib/api/handler';
import { ok } from '@/lib/api/response';
import { requirePermission } from '@/lib/admin/guard';
import { assignSubscriptionRider } from '@/lib/admin/subscriptions';
import { assignSubscriptionRiderSchema } from '@/lib/validators/subscription';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

const MESSAGE: Record<string, string> = {
  SUBSCRIPTION_NOT_FOUND: 'No subscription found for that id',
  PARTNER_NOT_FOUND: 'No delivery partner found for that id',
};

/**
 * POST /api/admin/subscriptions/:id/assign-rider — set (or clear, with
 * `partnerId: null`) the standing rider for a subscription. Every day's
 * order the 00:30 cron generates from this subscription from then on is
 * assigned to this rider automatically (`generateForSubscription`,
 * src/lib/subscription/generate-orders.ts) — no manual per-day assignment
 * needed.
 */
export const POST = route(async (request: Request, context: Context) => {
  const session = await requirePermission('customers');
  const { id: subscriptionId } = await context.params;
  const { partnerId } = await parseJson(request, assignSubscriptionRiderSchema);
  const ip = clientIp(request);

  const result = await assignSubscriptionRider(subscriptionId, partnerId, session.userId, ip);

  if (!result.ok) {
    throw ApiError.notFound(MESSAGE[result.reason] ?? 'Could not assign a rider');
  }

  return ok({ partnerId });
});
