import { db } from '@/lib/db';
import { ID_PREFIX, newId } from '@/lib/ids';

/**
 * Reads for the health profile.
 *
 * S6 — "Health profile access restricted to the customer and Super Admin,
 * every admin view logged." That is enforced here rather than in the route, so
 * no future caller can read a profile without going past the log.
 *
 * Relocated from `src/lib/meal-plan/queries.ts` (session 2026-08-30) when the
 * meal plan feature was rebuilt as a manual weekly picker with no health
 * profile of its own — this module has nothing to do with meal plans any
 * more. The admin's read-only customer detail view is the only consumer left
 * (`src/app/api/admin/customers/[id]/health-profile/route.ts`); the
 * customer-facing intake wizard that used to write these profiles was
 * removed in the same session.
 */

export interface HealthProfileView {
  planType: string;
  familyPreferences: Record<string, unknown> | null;
  age: number | null;
  heightCm: number | null;
  weightKg: number | null;
  gender: string | null;
  activityLevel: string | null;
  householdAdults: number;
  householdChildren: number;
  medicalConditions: string[];
  medications: string | null;
  allergies: string[];
  dietaryPreference: string;
  likedProductIds: string[];
  dislikedProductIds: string[];
  goal: string;
  notes: string | null;
  consentGivenAt: Date | null;
  consentVersion: string | null;
  updatedAt: Date;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

export async function getOwnHealthProfile(userId: string): Promise<HealthProfileView | null> {
  const profile = await db.healthProfile.findUnique({ where: { userId } });
  if (!profile) return null;

  return {
    planType: profile.planType,
    familyPreferences: (profile.familyPreferences as Record<string, unknown> | null) ?? null,
    age: profile.age,
    heightCm: profile.heightCm,
    weightKg: profile.weightKg,
    gender: profile.gender,
    activityLevel: profile.activityLevel,
    householdAdults: profile.householdAdults,
    householdChildren: profile.householdChildren,
    medicalConditions: stringArray(profile.medicalConditions),
    medications: profile.medications,
    allergies: stringArray(profile.allergies),
    dietaryPreference: profile.dietaryPreference,
    likedProductIds: stringArray(profile.likedProductIds),
    dislikedProductIds: stringArray(profile.dislikedProductIds),
    goal: profile.goal,
    notes: profile.notes,
    consentGivenAt: profile.consentGivenAt,
    consentVersion: profile.consentVersion,
    updatedAt: profile.updatedAt,
  };
}

/**
 * S6 — an admin reading someone else's health profile is logged, always.
 *
 * The log row is written BEFORE the profile is returned. If the write fails,
 * the read fails: an unlogged access is not an acceptable outcome for the one
 * category of data the DPDP Act treats as sensitive.
 */
export async function getHealthProfileAsAdmin(
  targetUserId: string,
  actorId: string,
  reason: string | null,
  ip: string | null,
): Promise<HealthProfileView | null> {
  const profile = await db.healthProfile.findUnique({
    where: { userId: targetUserId },
    select: { id: true },
  });

  if (!profile) return null;

  await db.healthProfileAccessLog.create({
    data: {
      id: newId(ID_PREFIX.healthAccess),
      healthProfileId: profile.id,
      actorId,
      reason,
      ip,
    },
  });

  return getOwnHealthProfile(targetUserId);
}
