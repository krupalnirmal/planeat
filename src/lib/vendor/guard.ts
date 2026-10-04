import { ApiError } from '@/lib/api/handler';
import { db } from '@/lib/db';
import { requireRole } from '@/lib/auth/session';
import type { AccessClaims } from '@/lib/auth/jwt';

/**
 * R9 — the vendor PWA's server-side gate, mirroring `src/lib/delivery/guard.ts`.
 *
 * A `VENDOR` role on the JWT is necessary but not sufficient: every route
 * also needs the `Vendor` row's own id, since supplies and ledger entries
 * are scoped to it, not to the user id. Looking that row up here — once, in
 * one place — means a route can never accidentally query another vendor's
 * supplies by forgetting the join.
 */

export interface VendorSession {
  claims: AccessClaims;
  vendorId: string;
  businessName: string;
  isActive: boolean;
}

export async function requireVendor(): Promise<VendorSession> {
  const claims = await requireRole('VENDOR');

  const vendor = await db.vendor.findUnique({
    where: { userId: claims.userId },
    select: { id: true, businessName: true, isActive: true },
  });

  // A user promoted to VENDOR without a vendor row is a data problem, not a
  // permissions one — but the customer-facing failure must still be "not
  // allowed", not a 500.
  if (!vendor) throw ApiError.forbidden('No vendor profile for this account');

  return {
    claims,
    vendorId: vendor.id,
    businessName: vendor.businessName,
    isActive: vendor.isActive,
  };
}
