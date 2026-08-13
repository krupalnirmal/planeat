import { ApiError, clientIp, parseJson, route } from '@/lib/api/handler';
import { ok } from '@/lib/api/response';
import { endSession, getSession, requireUser } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { ID_PREFIX, newId } from '@/lib/ids';
import { updateMeSchema } from '@/lib/validators/auth';

export const dynamic = 'force-dynamic';

/**
 * GET /api/me
 *
 * Returns null for a guest rather than 401. Guests browse the whole catalogue
 * (B17), so the header calling this on every page must not treat "not logged
 * in" as an error state.
 */
export const GET = route(async () => {
  const session = await getSession();
  if (!session) return ok({ user: null });

  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: {
      id: true,
      phone: true,
      name: true,
      email: true,
      dob: true,
      gender: true,
      role: true,
      preferredLanguage: true,
      createdAt: true,
      addresses: {
        orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
        select: {
          id: true,
          label: true,
          line1: true,
          line2: true,
          landmark: true,
          city: true,
          state: true,
          pincode: true,
          latitude: true,
          longitude: true,
          isDefault: true,
        },
      },
    },
  });

  if (!user) return ok({ user: null });
  return ok({ user });
});

/** PATCH /api/me — the profile step of onboarding, and later edits. */
export const PATCH = route(async (request: Request) => {
  const session = await requireUser();
  const input = await parseJson(request, updateMeSchema);

  const user = await db.user.update({
    where: { id: session.userId },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.email !== undefined ? { email: input.email || null } : {}),
      ...(input.dob !== undefined ? { dob: new Date(input.dob) } : {}),
      ...(input.gender !== undefined ? { gender: input.gender } : {}),
      ...(input.preferredLanguage !== undefined
        ? { preferredLanguage: input.preferredLanguage }
        : {}),
    },
    select: {
      id: true,
      phone: true,
      name: true,
      email: true,
      dob: true,
      gender: true,
      role: true,
      preferredLanguage: true,
    },
  });

  return ok({ user });
});

/**
 * DELETE /api/me — account closure (M1, M11).
 *
 * Deactivate and scrub identifiers rather than hard-delete: orders, wallet
 * ledger entries and audit logs are financial records that must survive, and
 * R4's ledger is append-only by design. The phone is released so the person
 * can sign up again, and every session is revoked.
 */
export const DELETE = route(async (request: Request) => {
  const session = await requireUser();

  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: { id: true, phone: true, name: true, email: true },
  });
  if (!user) throw ApiError.notFound('User not found');

  const closedAt = new Date();
  const tombstone = `deleted-${user.id}`;

  await db.$transaction([
    db.user.update({
      where: { id: user.id },
      data: {
        isActive: false,
        phone: tombstone.slice(0, 20),
        name: null,
        email: null,
        dob: null,
      },
    }),
    db.refreshToken.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: closedAt },
    }),
    db.healthProfile.deleteMany({ where: { userId: user.id } }),
    db.address.deleteMany({ where: { userId: user.id } }),
    db.auditLog.create({
      data: {
        id: newId(ID_PREFIX.auditLog),
        actorId: user.id,
        action: 'account.close',
        entityType: 'User',
        entityId: user.id,
        before: { phone: user.phone, name: user.name, email: user.email },
        after: { isActive: false },
        ip: clientIp(request),
      },
    }),
  ]);

  await endSession();
  return ok({ closed: true });
});
