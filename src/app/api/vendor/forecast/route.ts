import { z } from 'zod';
import { parseQuery, route } from '@/lib/api/handler';
import { ok } from '@/lib/api/response';
import { localeSchema } from '@/lib/validators/common';
import { getTomorrowRequirement } from '@/lib/vendor/forecast';
import { requireVendor } from '@/lib/vendor/guard';

export const dynamic = 'force-dynamic';

const querySchema = z.object({ locale: localeSchema.default('mr') });

/** GET /api/vendor/forecast — tomorrow's expected procurement, by product,
    for the meal-plan subscriptions this vendor is nearest to. */
export const GET = route(async (request: Request) => {
  const { vendorId } = await requireVendor();
  const { locale } = parseQuery(request, querySchema);
  const lines = await getTomorrowRequirement(vendorId, new Date(), locale);
  return ok({ lines });
});
