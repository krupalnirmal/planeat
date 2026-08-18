import { parseJson, route } from '@/lib/api/handler';
import { ok } from '@/lib/api/response';
import { requireUser } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { ID_PREFIX, newId } from '@/lib/ids';
import { familyMemberSchema } from '@/lib/validators/family-member';

export const dynamic = 'force-dynamic';

const familyMemberSelect = {
  id: true,
  name: true,
  age: true,
  gender: true,
  likedProductIds: true,
  dislikedProductIds: true,
  allergies: true,
  medicalConditions: true,
  notes: true,
  sortOrder: true,
} as const;

/** GET /api/health-profile/family-members — this household's members, in entry order. */
export const GET = route(async () => {
  const session = await requireUser();

  const profile = await db.healthProfile.findUnique({
    where: { userId: session.userId },
    select: { id: true },
  });
  if (!profile) return ok({ members: [] });

  const members = await db.familyMember.findMany({
    where: { healthProfileId: profile.id },
    orderBy: { sortOrder: 'asc' },
    select: familyMemberSelect,
  });

  return ok({ members });
});

/**
 * POST /api/health-profile/family-members
 *
 * The Family intake flow collects members BEFORE the household's own
 * preferences-and-consent step (doc §8 runs before §C) — so there is
 * usually no `HealthProfile` row yet the first time this is called. A bare
 * stub row (planType FAMILY, no consent yet) is created on demand rather
 * than requiring the profile step first; `PUT /api/health-profile` at the
 * end of the flow fills in the real preferences and stamps consent on the
 * same row, keyed by `userId`.
 */
export const POST = route(async (request: Request) => {
  const session = await requireUser();
  const input = await parseJson(request, familyMemberSchema);

  const profile = await db.healthProfile.upsert({
    where: { userId: session.userId },
    create: {
      id: newId(ID_PREFIX.healthProfile),
      userId: session.userId,
      planType: 'FAMILY',
      medicalConditions: [],
      allergies: [],
      likedProductIds: [],
      dislikedProductIds: [],
    },
    update: {},
    select: { id: true },
  });

  const existingCount = await db.familyMember.count({ where: { healthProfileId: profile.id } });

  const member = await db.familyMember.create({
    data: {
      id: newId(ID_PREFIX.familyMember),
      healthProfileId: profile.id,
      name: input.name,
      age: input.age ?? null,
      gender: input.gender ?? null,
      likedProductIds: input.likedProductIds,
      dislikedProductIds: input.dislikedProductIds,
      allergies: input.allergies,
      medicalConditions: input.medicalConditions,
      notes: input.notes ?? null,
      sortOrder: existingCount,
    },
    select: familyMemberSelect,
  });

  return ok({ member }, { status: 201 });
});
