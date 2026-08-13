import { ApiError } from '@/lib/api/handler';
import { db } from '@/lib/db';
import { requireRole } from '@/lib/auth/session';
import type { AccessClaims } from '@/lib/auth/jwt';

/**
 * R9 — the rider PWA's server-side gate, mirroring `src/lib/admin/guard.ts`.
 *
 * A `DELIVERY_PARTNER` role on the JWT is necessary but not sufficient: every
 * route also needs the `DeliveryPartner` row's own id, since assignments are
 * scoped to it, not to the user id. Looking that row up here — once, in one
 * place — means a route can never accidentally query another rider's orders
 * by forgetting the join.
 */

export interface DeliverySession {
  claims: AccessClaims;
  partnerId: string;
  serviceAreaId: string | null;
  isAvailable: boolean;
  name: string | null;
}

export async function requireDeliveryPartner(): Promise<DeliverySession> {
  const claims = await requireRole('DELIVERY_PARTNER');

  const partner = await db.deliveryPartner.findUnique({
    where: { userId: claims.userId },
    select: { id: true, serviceAreaId: true, isAvailable: true, user: { select: { name: true } } },
  });

  // A user promoted to DELIVERY_PARTNER without a partner row is a data
  // problem, not a permissions one — but the customer-facing failure must
  // still be "not allowed", not a 500.
  if (!partner) throw ApiError.forbidden('No delivery partner profile for this account');

  return {
    claims,
    partnerId: partner.id,
    serviceAreaId: partner.serviceAreaId,
    isAvailable: partner.isAvailable,
    name: partner.user.name,
  };
}
