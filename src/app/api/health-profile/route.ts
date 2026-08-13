import { parseJson, route } from '@/lib/api/handler';
import { ok } from '@/lib/api/response';
import { requireUser } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { ID_PREFIX, newId } from '@/lib/ids';
import { getOwnHealthProfile } from '@/lib/meal-plan/queries';
import { assessSafety } from '@/lib/meal-plan/safety';
import { CONSENT_VERSION } from '@/lib/meal-plan/taxonomy';
import { healthProfileSchema } from '@/lib/validators/health-profile';

export const dynamic = 'force-dynamic';

/**
 * GET /api/health-profile — the caller's own profile, or null.
 *
 * S6 — scoped to the caller. There is no `?userId=` parameter, so this route
 * cannot become a way to read someone else's health data. Admin access goes
 * through `getHealthProfileAsAdmin`, which logs every read.
 */
export const GET = route(async () => {
  const session = await requireUser();
  const profile = await getOwnHealthProfile(session.userId);

  return ok({ profile, consentVersion: CONSENT_VERSION });
});

/**
 * PUT /api/health-profile — the intake wizard, and later edits.
 *
 * S2 — consent is mandatory and is stamped with a timestamp and the version of
 * the disclaimer the customer actually saw. If the wording changes, existing
 * consents stay attached to the version they agreed to; that is the only thing
 * that makes a consent record mean anything.
 *
 * B5 — "Editing the health profile always prompts regeneration." The response
 * says so; the client offers the button rather than silently regenerating,
 * because a regeneration replaces a plan the customer may have been happy with.
 */
export const PUT = route(async (request: Request) => {
  const session = await requireUser();
  const input = await parseJson(request, healthProfileSchema);

  const existing = await db.healthProfile.findUnique({
    where: { userId: session.userId },
    select: { id: true, consentGivenAt: true, consentVersion: true },
  });

  const now = new Date();

  // Re-stamp consent only when it is new or the disclaimer version moved on.
  const consentGivenAt =
    existing?.consentGivenAt && existing.consentVersion === CONSENT_VERSION
      ? existing.consentGivenAt
      : now;

  const data = {
    age: input.age ?? null,
    heightCm: input.heightCm ?? null,
    weightKg: input.weightKg ?? null,
    gender: input.gender ?? null,
    activityLevel: input.activityLevel ?? null,
    householdAdults: input.householdAdults,
    householdChildren: input.householdChildren,
    medicalConditions: input.medicalConditions,
    medications: input.medications ?? null,
    allergies: input.allergies,
    dietaryPreference: input.dietaryPreference,
    likedProductIds: input.likedProductIds,
    dislikedProductIds: input.dislikedProductIds,
    goal: input.goal,
    notes: input.notes ?? null,
    consentGivenAt,
    consentVersion: CONSENT_VERSION,
  };

  await db.healthProfile.upsert({
    where: { userId: session.userId },
    create: { id: newId(ID_PREFIX.healthProfile), userId: session.userId, ...data },
    update: data,
  });

  // S3 — the customer is told a doctor should look at this BEFORE they wait
  // sixty seconds for a plan. Nothing is blocked (B8); it is a heads-up.
  const safety = assessSafety({
    age: input.age ?? null,
    medicalConditions: input.medicalConditions,
    medications: input.medications ?? null,
    notes: input.notes ?? null,
    goal: input.goal,
  });

  const hadPlan = await db.mealPlan.count({ where: { userId: session.userId } });

  return ok({
    saved: true,
    consentVersion: CONSENT_VERSION,
    flaggedForReview: safety.flaggedForReview,
    /** B5 — editing the profile always prompts regeneration. */
    shouldRegenerate: hadPlan > 0,
  });
});
