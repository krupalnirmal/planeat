import { parseJson, route } from '@/lib/api/handler';
import { ok } from '@/lib/api/response';
import { db } from '@/lib/db';
import { ID_PREFIX, newId } from '@/lib/ids';
import { waitlistSchema } from '@/lib/validators/address';

export const dynamic = 'force-dynamic';

/**
 * POST /api/waitlist
 *
 * B11 — the admin dashboard groups this by pincode, and that is how the owner
 * decides where to expand. A duplicate signup from the same number and pincode
 * is ignored rather than inflating the demand count for that area.
 */
export const POST = route(async (request: Request) => {
  const input = await parseJson(request, waitlistSchema);

  const existing = await db.waitlist.findFirst({
    where: { phone: input.phone, pincode: input.pincode },
    select: { id: true },
  });

  if (existing) return ok({ joined: true, alreadyOnList: true });

  await db.waitlist.create({
    data: {
      id: newId(ID_PREFIX.waitlist),
      phone: input.phone,
      pincode: input.pincode,
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
    },
  });

  return ok({ joined: true, alreadyOnList: false }, { status: 201 });
});
