import { z } from 'zod';
import { parseQuery, route } from '@/lib/api/handler';
import { ok } from '@/lib/api/response';
import { requireUser } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { getCurrentMealPlan } from '@/lib/meal-plan/queries';
import { localeSchema } from '@/lib/validators/common';

export const dynamic = 'force-dynamic';

const querySchema = z.object({ locale: localeSchema.default('mr') });

/**
 * GET /api/meal-plan/current
 *
 * Returns null rather than 404 when there is no plan yet — "you have not made
 * one" is a normal state for most customers, and the meal-plan tab renders it
 * as the starting call to action.
 */
export const GET = route(async (request: Request) => {
  const session = await requireUser();
  const { locale } = parseQuery(request, querySchema);

  const [plan, profile] = await Promise.all([
    getCurrentMealPlan(session.userId, locale),
    db.healthProfile.findUnique({
      where: { userId: session.userId },
      select: { consentGivenAt: true, updatedAt: true },
    }),
  ]);

  return ok({
    plan,
    hasProfile: profile !== null,
    hasConsent: Boolean(profile?.consentGivenAt),
    /** B5 — a profile edited after the plan was built means it is stale. */
    profileChangedSincePlan:
      plan !== null && profile !== null ? profile.updatedAt > plan.createdAt : false,
  });
});
