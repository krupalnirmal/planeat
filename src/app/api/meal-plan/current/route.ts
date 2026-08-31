import { z } from 'zod';
import { parseJson, parseQuery, route } from '@/lib/api/handler';
import { ok } from '@/lib/api/response';
import { requireUser } from '@/lib/auth/session';
import { getCustomerPlan, getPlanColumns, saveCustomerPlan } from '@/lib/meal-plan/queries';
import { localeSchema } from '@/lib/validators/common';

export const dynamic = 'force-dynamic';

const querySchema = z.object({ locale: localeSchema.default('mr') });

/**
 * GET /api/meal-plan/current
 *
 * Returns the 4 pickable category columns alongside whatever the customer
 * has already saved (or `plan: null` for "you haven't built one yet") —
 * one round trip for the whole builder screen, no health-profile/consent
 * gating any more (session 2026-08-30, the manual picker has no profile).
 */
export const GET = route(async (request: Request) => {
  const session = await requireUser();
  const { locale } = parseQuery(request, querySchema);

  const [plan, columns] = await Promise.all([
    getCustomerPlan(session.userId, locale),
    getPlanColumns(locale),
  ]);

  return ok({ plan, columns });
});

const saveSchema = z.object({
  days: z
    .array(
      z.object({
        dayOfWeek: z.number().int().min(1).max(7),
        variantIds: z.array(z.string()),
      }),
    )
    .length(7),
});

/**
 * PUT /api/meal-plan/current
 *
 * Replaces the customer's whole week in one go — the builder screen always
 * submits all 7 days, picked or not, so a day the customer cleared out
 * really does end up empty rather than keeping its last save.
 */
export const PUT = route(async (request: Request) => {
  const session = await requireUser();
  const { days } = await parseJson(request, saveSchema);

  const plan = await saveCustomerPlan(session.userId, days);
  return ok({ plan });
});
