import { ApiError, clientIp, parseJson, route } from '@/lib/api/handler';
import { ok } from '@/lib/api/response';
import { requireSuperAdmin } from '@/lib/admin/guard';
import { getHealthProfileAsAdmin } from '@/lib/health-profile/queries';
import { healthProfileAccessSchema } from '@/lib/validators/admin';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

/**
 * POST /api/admin/customers/:id/health-profile — S6.
 *
 *   "Health data is sensitive personal data under India's DPDP Act … Health
 *    profile access restricted to the customer and Super Admin, every admin
 *    view logged."
 *
 * Three deliberate choices here:
 *
 * 1. **Super Admin only.** A store admin packing bags has no business reading
 *    somebody's medical conditions.
 *
 * 2. **POST, not GET.** A read that must be logged and must carry a reason is
 *    not a safe, idempotent, prefetchable, browser-cacheable GET. Making it a
 *    POST stops it being triggered by a link, a crawler or a router prefetch.
 *
 * 3. **A reason is mandatory**, minimum five characters. The access log is
 *    only useful if it says why — and the person who has to explain it a year
 *    later will not remember.
 */
export const POST = route(async (request: Request, context: Context) => {
  const session = await requireSuperAdmin();
  const { id } = await context.params;
  const { reason } = await parseJson(request, healthProfileAccessSchema);

  // The log row is written before anything is returned. If it fails, the read
  // fails (D-110).
  const profile = await getHealthProfileAsAdmin(id, session.userId, reason, clientIp(request));

  if (!profile) throw ApiError.notFound('That customer has no health profile');

  return ok({ profile });
});
