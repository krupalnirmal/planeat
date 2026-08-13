import { ApiError, parseJson, route } from '@/lib/api/handler';
import { ok } from '@/lib/api/response';
import { requireUser } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { ID_PREFIX, newId } from '@/lib/ids';
import { checkServiceability } from '@/lib/serviceability';
import { addressSchema } from '@/lib/validators/address';

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
  createdAt: true,
} as const;

/** GET /api/addresses — the caller's saved addresses, default first. */
export const GET = route(async () => {
  const session = await requireUser();

  const addresses = await db.address.findMany({
    where: { userId: session.userId },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    select: addressSelect,
  });

  return ok({ addresses });
});

/**
 * POST /api/addresses
 *
 * B11 is enforced at write time: an address we cannot deliver to is not worth
 * saving, and finding that out at checkout instead is a much worse moment.
 */
export const POST = route(async (request: Request) => {
  const session = await requireUser();
  const input = await parseJson(request, addressSchema);

  const serviceability = await checkServiceability({
    pincode: input.pincode,
    latitude: input.latitude,
    longitude: input.longitude,
  });

  if (!serviceability.serviceable) {
    throw ApiError.notServiceable('We do not deliver to that address yet', {
      reason: serviceability.reason,
      distanceMeters: serviceability.distanceMeters,
    });
  }

  const existingCount = await db.address.count({ where: { userId: session.userId } });
  // The first address is always the default — nobody should have to pick one.
  const isDefault = input.isDefault || existingCount === 0;

  const address = await db.$transaction(async (tx) => {
    if (isDefault) {
      await tx.address.updateMany({
        where: { userId: session.userId, isDefault: true },
        data: { isDefault: false },
      });
    }

    return tx.address.create({
      data: {
        id: newId(ID_PREFIX.address),
        userId: session.userId,
        label: input.label,
        line1: input.line1,
        line2: input.line2 || null,
        landmark: input.landmark || null,
        city: input.city,
        state: input.state,
        pincode: input.pincode,
        latitude: input.latitude ?? null,
        longitude: input.longitude ?? null,
        isDefault,
      },
      select: addressSelect,
    });
  });

  return ok({ address }, { status: 201 });
});
