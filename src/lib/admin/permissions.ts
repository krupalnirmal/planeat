/**
 * The configurable slice of the admin panel (session 2026-09-17).
 *
 * `Dashboard` is always visible to every STORE_ADMIN and isn't listed here.
 * `Settings`, `Audit Log`, and `Staff` stay SUPER_ADMIN-only unconditionally
 * (unchanged from before this system existed — `requireSuperAdmin()`, not
 * this list) since they touch money rules, other accounts, or the audit
 * trail itself; a STORE_ADMIN's `permissions` array can never grant them.
 *
 * This is the single source of truth both `requirePermission()`
 * (`src/lib/admin/guard.ts`) and the staff-creation checklist
 * (`src/components/admin/delivery-partners-screen.tsx`) read from.
 */
export const ADMIN_PERMISSION_SECTIONS = [
  'picklist',
  'orders',
  'inventory',
  'catalogue',
  'customers',
  'waitlist',
] as const;

export type AdminPermissionSection = (typeof ADMIN_PERMISSION_SECTIONS)[number];

export function isAdminPermissionSection(value: unknown): value is AdminPermissionSection {
  return typeof value === 'string' && (ADMIN_PERMISSION_SECTIONS as readonly string[]).includes(value);
}

/** Narrows a `User.permissions` JSON column to a clean string array, or
    `null` for "unrestricted" — anything malformed reads as unrestricted
    rather than accidentally locking an account out. */
export function parsePermissions(value: unknown): AdminPermissionSection[] | null {
  if (!Array.isArray(value)) return null;
  const sections = value.filter(isAdminPermissionSection);
  return sections;
}
