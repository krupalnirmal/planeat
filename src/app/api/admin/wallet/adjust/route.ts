import { ApiError, clientIp, parseJson, route } from '@/lib/api/handler';
import { ok } from '@/lib/api/response';
import { STORE_ROLES, requireRole } from '@/lib/auth/session';
import { adjustWallet } from '@/lib/wallet/adjust';
import { adjustWalletSchema } from '@/lib/validators/wallet';

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/wallet/adjust — M7's manual adjustment.
 *
 * R9 — RBAC is enforced here, server-side. A reason is mandatory and the whole
 * action is written to the audit log before the ledger entry, with the audit id
 * as the ledger reference. Every rupee an admin moves is traceable to a person
 * and a sentence.
 *
 * The admin UI for this arrives in Phase 8; the endpoint belongs to the ledger,
 * which is M7.
 */
export const POST = route(async (request: Request) => {
  const session = await requireRole(...STORE_ROLES);
  const input = await parseJson(request, adjustWalletSchema);

  const result = await adjustWallet({
    userId: input.userId,
    actorId: session.userId,
    direction: input.direction,
    amountPaise: BigInt(input.amountPaise),
    reason: input.reason,
    ip: clientIp(request),
  });

  if (!result.ok) {
    switch (result.reason) {
      case 'USER_NOT_FOUND':
        throw ApiError.notFound('Customer not found');
      case 'INSUFFICIENT_BALANCE':
        throw ApiError.conflict('That would take the wallet below zero');
      case 'INVALID_AMOUNT':
        throw ApiError.badRequest('Amount must be greater than zero');
    }
  }

  return ok({ transactionId: result.transactionId, balancePaise: result.balancePaise });
});
