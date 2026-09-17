import { ApiError, parseJson, route } from '@/lib/api/handler';
import { ok } from '@/lib/api/response';
import { verifyOtp } from '@/lib/auth/otp';
import { startSession } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { ID_PREFIX, newId } from '@/lib/ids';
import { verifyOtpSchema } from '@/lib/validators/auth';

export const dynamic = 'force-dynamic';

const OTP_FAILURE_MESSAGES: Record<string, string> = {
  NOT_FOUND: 'No code was requested for this number',
  EXPIRED: 'That code has expired',
  TOO_MANY_ATTEMPTS: 'Too many wrong attempts',
  MISMATCH: 'That code is not correct',
};

/**
 * POST /api/auth/otp/verify
 *
 * Verifies the code, creates the user on first login, and starts a session.
 * `isNewUser` tells the client whether to route into the profile step (M1).
 */
const STAFF_ROLES = ['STORE_ADMIN', 'SUPER_ADMIN', 'DELIVERY_PARTNER'] as const;

export const POST = route(async (request: Request) => {
  const { phone, code, context } = await parseJson(request, verifyOtpSchema);

  const result = await verifyOtp(phone, code, 'LOGIN');

  if (!result.ok) {
    const status = result.reason === 'TOO_MANY_ATTEMPTS' ? 429 : 401;
    throw new ApiError(
      result.reason === 'TOO_MANY_ATTEMPTS' ? 'RATE_LIMITED' : 'UNAUTHORIZED',
      OTP_FAILURE_MESSAGES[result.reason],
      status,
      { reason: result.reason },
    );
  }

  const existing = await db.user.findUnique({
    where: { phone },
    select: { id: true, role: true, phone: true, name: true, isActive: true },
  });

  if (existing && !existing.isActive) {
    throw ApiError.forbidden('This account has been closed');
  }

  // `/staff/login` (session 2026-09-17): a phone with no staff-role account
  // yet must not silently become a CUSTOMER the way the storefront login
  // intentionally does — that would both onboard a stray customer account
  // from a staff-branded page and mislead the caller with a session that
  // gets immediately bounced by the admin/delivery layout's own role check.
  // A phone must already be a staff-role account (created from the admin
  // panel) before it can ever reach `/admin` or `/delivery` this way.
  if (context === 'staff' && (!existing || !STAFF_ROLES.includes(existing.role as (typeof STAFF_ROLES)[number]))) {
    throw ApiError.forbidden('This phone number is not registered for staff access');
  }

  const user =
    existing ??
    (await db.user.create({
      data: { id: newId(ID_PREFIX.user), phone, role: 'CUSTOMER' },
      select: { id: true, role: true, phone: true, name: true, isActive: true },
    }));

  await startSession({ id: user.id, role: user.role, phone: user.phone });

  return ok({
    user: { id: user.id, phone: user.phone, name: user.name, role: user.role },
    // A user who has never set a name still needs the profile step.
    isNewUser: existing === null || !user.name,
  });
});
