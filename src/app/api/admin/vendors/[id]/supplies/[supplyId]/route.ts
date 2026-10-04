import { ApiError, clientIp, parseJson, route } from '@/lib/api/handler';
import { ok } from '@/lib/api/response';
import { requireStoreAdmin } from '@/lib/admin/guard';
import { confirmSupply, rejectSupply } from '@/lib/admin/vendors';
import { confirmSupplySchema } from '@/lib/validators/admin';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string; supplyId: string }> };

const MESSAGE: Record<string, string> = {
  NOT_FOUND: 'That supply entry was not found',
  NOT_PENDING: 'That supply entry has already been confirmed or rejected',
};

/** PATCH /api/admin/vendors/:id/supplies/:supplyId — confirm (stock + ledger credit) or reject. */
export const PATCH = route(async (request: Request, context: Context) => {
  const session = await requireStoreAdmin();
  const { supplyId } = await context.params;
  const input = await parseJson(request, confirmSupplySchema);

  if (input.action === 'confirm') {
    const result = await confirmSupply(supplyId, session.userId, clientIp(request));
    if (!result.ok) {
      const message = MESSAGE[result.reason];
      throw result.reason === 'NOT_FOUND'
        ? ApiError.notFound(message)
        : ApiError.conflict(message);
    }
    return ok({ supplyId, status: 'CONFIRMED' });
  }

  if (!input.rejectionReason) {
    throw ApiError.badRequest('A reason is required to reject a supply entry');
  }

  const result = await rejectSupply(supplyId, input.rejectionReason, session.userId, clientIp(request));
  if (!result.ok) {
    const message = MESSAGE[result.reason];
    throw result.reason === 'NOT_FOUND'
      ? ApiError.notFound(message)
      : ApiError.conflict(message);
  }
  return ok({ supplyId, status: 'REJECTED' });
});
