import { STORE_ROLES, requireRole } from '@/lib/auth/session';
import type { AccessClaims } from '@/lib/auth/jwt';

/**
 * R9 — "RBAC is server-side on every route. Never rely on a client-side role
 * check."
 *
 * Two levels, and the split is deliberate:
 *
 *   `requireStoreAdmin` — day-to-day operations. The person packing bags and
 *   changing stock does not need to be the owner.
 *
 *   `requireSuperAdmin` — anything that touches money rules, other users, or
 *   HEALTH DATA. S6 restricts health profiles to the customer and the Super
 *   Admin specifically, so a store admin browsing customers must not be able
 *   to open one.
 */

export async function requireStoreAdmin(): Promise<AccessClaims> {
  return requireRole(...STORE_ROLES);
}

export async function requireSuperAdmin(): Promise<AccessClaims> {
  return requireRole('SUPER_ADMIN');
}
