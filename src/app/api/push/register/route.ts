import { parseJson, route } from '@/lib/api/handler';
import { ok } from '@/lib/api/response';
import { registerPushToken } from '@/lib/notifications/push-tokens';
import { requireUser } from '@/lib/auth/session';
import { pushRegisterSchema } from '@/lib/validators/common';

export const dynamic = 'force-dynamic';

/**
 * POST /api/push/register — any signed-in user, not only riders. A customer's
 * order-status push and a rider's new-assignment push are the same mechanism.
 */
export const POST = route(async (request: Request) => {
  const session = await requireUser();
  const { token, platform } = await parseJson(request, pushRegisterSchema);

  await registerPushToken(session.userId, token, platform);
  return ok({ registered: true });
});
