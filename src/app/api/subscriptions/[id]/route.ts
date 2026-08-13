import { ApiError, parseJson, route } from '@/lib/api/handler';
import { ok } from '@/lib/api/response';
import { requireUser } from '@/lib/auth/session';
import { updateSubscription } from '@/lib/subscription/manage';
import { updateSubscriptionSchema } from '@/lib/validators/subscription';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

/**
 * PATCH /api/subscriptions/:id — change slot or address for FUTURE deliveries.
 *
 * Orders already generated carry an address snapshot, so today's delivery
 * still goes where it was promised. Rewriting where a bag already on a bike is
 * headed would be worse than the inconvenience it saved.
 */
export const PATCH = route(async (request: Request, context: Context) => {
  const session = await requireUser();
  const { id } = await context.params;
  const input = await parseJson(request, updateSubscriptionSchema);

  const result = await updateSubscription(id, session.userId, {
    addressId: input.addressId,
    deliverySlot: input.deliverySlot,
  });

  if (result.ok) return ok({ updated: true });

  if (result.reason === 'ADDRESS_NOT_FOUND') throw ApiError.notFound('Address not found');
  throw ApiError.notFound('Subscription not found');
});
