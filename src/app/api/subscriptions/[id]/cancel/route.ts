import { ApiError, route } from '@/lib/api/handler';
import { ok } from '@/lib/api/response';
import { requireUser } from '@/lib/auth/session';
import { cancelSubscription } from '@/lib/subscription/manage';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

/**
 * POST /api/subscriptions/:id/cancel
 *
 * B3 — "On cancellation, refund unused balance to the wallet. Never forfeit
 * it." The prepaid float never left the wallet (D-119), so it is already the
 * customer's; the plan fee is what gets prorated and credited back.
 *
 * Idempotent on the subscription id, so a double-tapped cancel refunds once.
 */
export const POST = route(async (_request: Request, context: Context) => {
  const session = await requireUser();
  const { id } = await context.params;

  const result = await cancelSubscription(id, session.userId);

  if (result.ok) {
    return ok({
      cancelled: true,
      refundedPaise: result.refundedPaise,
      remainingDays: result.remainingDays,
    });
  }

  if (result.reason === 'NOT_FOUND') throw ApiError.notFound('Subscription not found');
  throw ApiError.conflict('That subscription is already cancelled');
});
