import { db } from '@/lib/db';
import type { SubscriptionStatus } from '@/generated/prisma/enums';
import { audit } from './audit';

/**
 * A subscription's standing rider (`Subscription.assignedPartnerId`) — set
 * once by the owner, applied automatically to every future day's generated
 * order by the 00:30 cron (`generateForSubscription`,
 * src/lib/subscription/generate-orders.ts) instead of the owner assigning
 * each day's order by hand. Passing `partnerId: null` clears it, returning
 * that subscription to manual per-day assignment.
 */

export interface AdminSubscriptionRow {
  id: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  status: SubscriptionStatus;
  startDate: Date;
  endDate: Date;
  /** 0 once ended — never negative, so a stale/completed subscription
      doesn't read as "-4 days left" in a list built for quick scanning. */
  daysRemaining: number;
  assignedPartnerId: string | null;
  assignedPartnerName: string | null;
}

/** The "My Meal Plan" admin module (session 2026-09-18) — every customer's
    subscription in one cross-customer list, the thing `getCustomerDetail`
    (`src/lib/admin/customers.ts`) only ever showed one customer at a time.
    Row-level rider assignment reuses `assignSubscriptionRider` below;
    day-by-day plan contents still live on the customer detail page
    (`CustomerPlanView`) rather than being duplicated here. */
export async function listSubscriptions(
  filter: {
    status?: SubscriptionStatus;
    query?: string;
    /** `startDate` range (inclusive) — dashboard v2's Plans tab date
        filter (session 2026-09-18, Part M). */
    dateFrom?: Date;
    dateTo?: Date;
  },
  { skip, take }: { skip: number; take: number },
): Promise<{ subscriptions: AdminSubscriptionRow[]; total: number }> {
  const where = {
    ...(filter.status ? { status: filter.status } : {}),
    ...(filter.query
      ? {
          OR: [
            { user: { name: { contains: filter.query } } },
            { user: { phone: { contains: filter.query } } },
          ],
        }
      : {}),
    ...(filter.dateFrom || filter.dateTo
      ? {
          startDate: {
            ...(filter.dateFrom ? { gte: filter.dateFrom } : {}),
            ...(filter.dateTo ? { lte: filter.dateTo } : {}),
          },
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    db.subscription.findMany({
      where,
      // Ending-soonest first within a status — the list an owner scans to
      // decide who needs a renewal nudge, not creation order.
      orderBy: [{ status: 'asc' }, { endDate: 'asc' }],
      skip,
      take,
      select: {
        id: true,
        userId: true,
        status: true,
        startDate: true,
        endDate: true,
        assignedPartnerId: true,
        user: { select: { name: true, phone: true } },
        assignedPartner: { select: { user: { select: { name: true, phone: true } } } },
      },
    }),
    db.subscription.count({ where }),
  ]);

  const now = new Date();

  return {
    total,
    subscriptions: rows.map((row) => ({
      id: row.id,
      customerId: row.userId,
      customerName: row.user.name ?? row.user.phone,
      customerPhone: row.user.phone,
      status: row.status,
      startDate: row.startDate,
      endDate: row.endDate,
      daysRemaining: Math.max(0, Math.ceil((row.endDate.getTime() - now.getTime()) / 86_400_000)),
      assignedPartnerId: row.assignedPartnerId,
      assignedPartnerName: row.assignedPartner
        ? (row.assignedPartner.user.name ?? row.assignedPartner.user.phone)
        : null,
    })),
  };
}

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
