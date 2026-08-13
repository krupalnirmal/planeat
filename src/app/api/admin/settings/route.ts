import { ApiError, clientIp, parseJson, route } from '@/lib/api/handler';
import { ok } from '@/lib/api/response';
import { requireStoreAdmin, requireSuperAdmin } from '@/lib/admin/guard';
import { listSettings, updateSetting } from '@/lib/admin/settings';
import { settingUpdateSchema } from '@/lib/validators/admin';

export const dynamic = 'force-dynamic';

/** GET /api/admin/settings — every runtime-editable value (R8, M9). */
export const GET = route(async () => {
  await requireStoreAdmin();
  return ok({ settings: await listSettings() });
});

/**
 * PATCH /api/admin/settings — Super Admin only.
 *
 * These values move real money: the delivery fee, the COD cap, the wallet
 * prepay buffer, B4's portion sizes. Changing one is a business decision, not
 * an operational one, so it sits above the store-admin line.
 */
export const PATCH = route(async (request: Request) => {
  const session = await requireSuperAdmin();
  const input = await parseJson(request, settingUpdateSchema);

  const result = await updateSetting(
    input.key,
    input.value,
    session.userId,
    clientIp(request),
  );

  if (!result.ok) {
    if (result.reason === 'UNKNOWN_KEY') throw ApiError.notFound('No such setting');
    throw ApiError.badRequest(result.detail ?? 'That value is the wrong type');
  }

  return ok({ updated: true, key: input.key });
});
