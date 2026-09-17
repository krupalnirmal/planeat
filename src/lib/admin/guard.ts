import { db } from '@/lib/db';
import { ApiError } from '@/lib/api/handler';
import { STORE_ROLES, requireRole } from '@/lib/auth/session';
import type { AccessClaims } from '@/lib/auth/jwt';
import { type AdminPermissionSection, parsePermissions } from './permissions';

/**
 * R9 — "RBAC is server-side on every route. Never rely on a client-side role
 * check."
 *
 * Three levels, and the split is deliberate:
 *
 *   `requireStoreAdmin` — any store or super admin, no section check. Used by
 *   routes with nothing to restrict (e.g. the dashboard) and by
 *   `requirePermission` itself as its first gate.
 *
 *   `requirePermission` — day-to-day operations, but scoped to whichever of
 *   the 6 configurable sections (`src/lib/admin/permissions.ts`) a given
 *   STORE_ADMIN account was granted at creation (session 2026-09-17). A
 *   `null` `permissions` column means unrestricted — every account that
 *   existed before this system shipped keeps exactly the access it already
 *   had. SUPER_ADMIN always passes regardless of `permissions`.
 *
 *   `requireSuperAdmin` — anything that touches money rules, other users, or
 *   HEALTH DATA. S6 restricts health profiles to the customer and the Super
 *   Admin specifically, so a store admin browsing customers must not be able
 *   to open one. Staff management (creating/editing other accounts) lives
 *   here too, for the same reason.
 */

export async function requireStoreAdmin(): Promise<AccessClaims> {
  return requireRole(...STORE_ROLES);
}

export async function requireSuperAdmin(): Promise<AccessClaims> {
  return requireRole('SUPER_ADMIN');
}

/** Looked up fresh from the DB on every call rather than embedded in the JWT
    — a revoked permission must take effect on this request, not after the
    caller's next silent token refresh (same reasoning `requireDeliveryPartner`
    already applies to its own DB lookup, `src/lib/delivery/guard.ts`). */
export async function requirePermission(section: AdminPermissionSection): Promise<AccessClaims> {
  const session = await requireStoreAdmin();
  if (session.role === 'SUPER_ADMIN') return session;

  const user = await db.user.findUnique({ where: { id: session.userId }, select: { permissions: true } });
  const permissions = parsePermissions(user?.permissions);
  if (permissions !== null && !permissions.includes(section)) throw ApiError.forbidden();
  return session;
}
