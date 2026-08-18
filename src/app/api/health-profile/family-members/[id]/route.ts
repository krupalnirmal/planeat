import { ApiError, parseJson, route } from '@/lib/api/handler';
import { ok } from '@/lib/api/response';
import { requireUser } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { updateFamilyMemberSchema } from '@/lib/validators/family-member';

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

type Context = { params: Promise<{ id: string }> };

/** R9 — ownership is checked server-side, never trusted from the URL. */
async function ownedMember(userId: string, id: string) {
  const member = await db.familyMember.findUnique({
    where: { id },
    select: { id: true, healthProfile: { select: { userId: true } } },
  });
  if (!member || member.healthProfile.userId !== userId) {
    throw ApiError.notFound('Family member not found');
  }
  return member;
}

export const PATCH = route(async (request: Request, context: Context) => {
  const session = await requireUser();
  const { id } = await context.params;
  const existing = await ownedMember(session.userId, id);

  const input = await parseJson(request, updateFamilyMemberSchema);

  const member = await db.familyMember.update({
    where: { id: existing.id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.age !== undefined ? { age: input.age ?? null } : {}),
      ...(input.gender !== undefined ? { gender: input.gender ?? null } : {}),
      ...(input.likedProductIds !== undefined ? { likedProductIds: input.likedProductIds } : {}),
      ...(input.dislikedProductIds !== undefined
        ? { dislikedProductIds: input.dislikedProductIds }
        : {}),
      ...(input.allergies !== undefined ? { allergies: input.allergies } : {}),
      ...(input.medicalConditions !== undefined
        ? { medicalConditions: input.medicalConditions }
        : {}),
      ...(input.notes !== undefined ? { notes: input.notes ?? null } : {}),
    },
    select: familyMemberSelect,
  });

  return ok({ member });
});

export const DELETE = route(async (_request: Request, context: Context) => {
  const session = await requireUser();
  const { id } = await context.params;
  const existing = await ownedMember(session.userId, id);

  await db.familyMember.delete({ where: { id: existing.id } });

  return ok({ deleted: true });
});
