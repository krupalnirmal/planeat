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

  const [plan, { columns, dailyEssentials }] = await Promise.all([
    getCustomerPlan(session.userId, locale),
    getPlanColumns(locale),
  ]);

  return ok({ plan, columns, dailyEssentials });
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
  // "Daily Use Vegetables" (session 2026-09-06) — picked once, applied to
  // every day. Optional so an older cached client tab doesn't 422 on save.
  dailyEssentialVariantIds: z.array(z.string()).default([]),
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
  const { locale } = parseQuery(request, querySchema);
  const { days, dailyEssentialVariantIds } = await parseJson(request, saveSchema);

  const plan = await saveCustomerPlan(session.userId, days, dailyEssentialVariantIds, locale);
  return ok({ plan });
});
