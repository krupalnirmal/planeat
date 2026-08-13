import { ApiError, parseJson, route } from '@/lib/api/handler';
import { ok } from '@/lib/api/response';
import { requireUser } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { checkServiceability } from '@/lib/serviceability';
import { updateAddressSchema } from '@/lib/validators/address';

export const dynamic = 'force-dynamic';

const addressSelect = {
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
} as const;

type Context = { params: Promise<{ id: string }> };

/**
 * R9 — ownership is checked server-side on every call. An address id is
 * guessable enough that "the client only shows you your own" is not a control.
 */
async function ownedAddress(userId: string, id: string) {
  const address = await db.address.findUnique({
    where: { id },
    select: { id: true, userId: true, isDefault: true },
  });
  if (!address || address.userId !== userId) throw ApiError.notFound('Address not found');
  return address;
}

export const PATCH = route(async (request: Request, context: Context) => {
  const session = await requireUser();
  const { id } = await context.params;
  const existing = await ownedAddress(session.userId, id);

  const input = await parseJson(request, updateAddressSchema);

  if (input.pincode || input.latitude !== undefined || input.longitude !== undefined) {
    const current = await db.address.findUniqueOrThrow({
      where: { id },
      select: { pincode: true, latitude: true, longitude: true },
    });
    const serviceability = await checkServiceability({
      pincode: input.pincode ?? current.pincode,
      latitude: input.latitude ?? current.latitude ?? undefined,
      longitude: input.longitude ?? current.longitude ?? undefined,
    });
    if (!serviceability.serviceable) {
      throw ApiError.notServiceable('We do not deliver to that address yet', {
        reason: serviceability.reason,
      });
    }
  }

  const address = await db.$transaction(async (tx) => {
    if (input.isDefault === true) {
      await tx.address.updateMany({
        where: { userId: session.userId, isDefault: true },
        data: { isDefault: false },
      });
    }

    return tx.address.update({
      where: { id: existing.id },
      data: {
        ...(input.label !== undefined ? { label: input.label } : {}),
        ...(input.line1 !== undefined ? { line1: input.line1 } : {}),
        ...(input.line2 !== undefined ? { line2: input.line2 || null } : {}),
        ...(input.landmark !== undefined ? { landmark: input.landmark || null } : {}),
        ...(input.city !== undefined ? { city: input.city } : {}),
        ...(input.state !== undefined ? { state: input.state } : {}),
        ...(input.pincode !== undefined ? { pincode: input.pincode } : {}),
        ...(input.latitude !== undefined ? { latitude: input.latitude } : {}),
        ...(input.longitude !== undefined ? { longitude: input.longitude } : {}),
        ...(input.isDefault !== undefined ? { isDefault: input.isDefault } : {}),
      },
      select: addressSelect,
    });
  });

  return ok({ address });
});

export const DELETE = route(async (_request: Request, context: Context) => {
  const session = await requireUser();
  const { id } = await context.params;
  const existing = await ownedAddress(session.userId, id);

  await db.$transaction(async (tx) => {
    await tx.address.delete({ where: { id: existing.id } });

    // Never leave the account with addresses but no default — the checkout
    // address selector would open on nothing.
    if (existing.isDefault) {
      const next = await tx.address.findFirst({
        where: { userId: session.userId },
        orderBy: { createdAt: 'asc' },
        select: { id: true },
      });
      if (next) {
        await tx.address.update({ where: { id: next.id }, data: { isDefault: true } });
      }
    }
  });

  return ok({ deleted: true });
});
