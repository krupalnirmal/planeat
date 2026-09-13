import { db } from '@/lib/db';
import { audit } from './audit';

/**
 * A subscription's standing rider (`Subscription.assignedPartnerId`) — set
 * once by the owner, applied automatically to every future day's generated
 * order by the 00:30 cron (`generateForSubscription`,
 * src/lib/subscription/generate-orders.ts) instead of the owner assigning
 * each day's order by hand. Passing `partnerId: null` clears it, returning
 * that subscription to manual per-day assignment.
 */

export type AssignSubscriptionRiderResult =
  | { ok: true }
  | { ok: false; reason: 'SUBSCRIPTION_NOT_FOUND' | 'PARTNER_NOT_FOUND' };

export async function assignSubscriptionRider(
  subscriptionId: string,
  partnerId: string | null,
  actorId: string,
  ip: string | null,
): Promise<AssignSubscriptionRiderResult> {
  const subscription = await db.subscription.findUnique({
    where: { id: subscriptionId },
    select: { id: true },
  });
  if (!subscription) return { ok: false, reason: 'SUBSCRIPTION_NOT_FOUND' };

  if (partnerId) {
    const partner = await db.deliveryPartner.findUnique({ where: { id: partnerId }, select: { id: true } });
    if (!partner) return { ok: false, reason: 'PARTNER_NOT_FOUND' };
  }

  await db.subscription.update({
    where: { id: subscriptionId },
    data: { assignedPartnerId: partnerId },
  });

  await audit({
    actorId,
    action: 'subscription.assign_rider',
    entityType: 'Subscription',
    entityId: subscriptionId,
    after: { partnerId },
    ip,
  });

  return { ok: true };
}
