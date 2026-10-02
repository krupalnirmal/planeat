import { ApiError } from '@/lib/api/handler';
import { startSession } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { ID_PREFIX, newId } from '@/lib/ids';

const STAFF_ROLES = ['STORE_ADMIN', 'SUPER_ADMIN', 'DELIVERY_PARTNER'] as const;

export interface LoginResult {
  user: { id: string; phone: string; name: string | null; role: string };
  isNewUser: boolean;
}

/**
 * Shared tail of both OTP verify routes (code-based and MSG91-widget-token-based) —
 * once the OTP itself is confirmed, finding or creating the user and starting the
 * session is identical either way.
 */
export async function completeLogin(phone: string, context?: 'staff'): Promise<LoginResult> {
  const existing = await db.user.findUnique({
    where: { phone },
    select: { id: true, role: true, phone: true, name: true, isActive: true },
  });

  if (existing && !existing.isActive) {
    throw ApiError.forbidden('This account has been closed');
  }

  // `/staff/login` (session 2026-09-17): a phone with no staff-role account
  // yet must not silently become a CUSTOMER the way the storefront login
  // intentionally does.
  if (
    context === 'staff' &&
    (!existing || !STAFF_ROLES.includes(existing.role as (typeof STAFF_ROLES)[number]))
  ) {
    throw ApiError.forbidden('This phone number is not registered for staff access');
  }

  const user =
    existing ??
    (await db.user.create({
      data: { id: newId(ID_PREFIX.user), phone, role: 'CUSTOMER' },
      select: { id: true, role: true, phone: true, name: true, isActive: true },
    }));

  await startSession({ id: user.id, role: user.role, phone: user.phone });

  return {
    user: { id: user.id, phone: user.phone, name: user.name, role: user.role },
    // A user who has never set a name still needs the profile step.
    isNewUser: existing === null || !user.name,
  };
}
