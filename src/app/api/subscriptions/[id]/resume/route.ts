import { ApiError, route } from '@/lib/api/handler';
import { ok } from '@/lib/api/response';
import { requireUser } from '@/lib/auth/session';
import { resumeSubscription } from '@/lib/subscription/manage';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

/**
 * POST /api/subscriptions/:id/resume
 *
 * Lifts future pause days only. A pause that has already passed is history,
 * and clearing it would make My Week lie about last Tuesday.
 */
export const POST = route(async (_request: Request, context: Context) => {
  const session = await requireUser();
  const { id } = await context.params;

  const result = await resumeSubscription(id, session.userId);
  if (!result.ok) throw ApiError.notFound('Subscription not found');

  return ok({ resumed: true });
});
