import { ApiError, clientIp, parseJson, route } from '@/lib/api/handler';
import { ok } from '@/lib/api/response';
import { requireSuperAdmin } from '@/lib/admin/guard';
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
 * SUPER_ADMIN-only (found session 2026-09-30 — this used to accept any
 * STORE_ADMIN with `requireRole(...STORE_ROLES)`, with no section gate at
 * all, since `wallet` was never one of `ADMIN_PERMISSION_SECTIONS`. That let
 * a STORE_ADMIN restricted to e.g. only `picklist` still credit/debit any
 * customer's wallet directly. Matches `settings.ts`'s own precedent — "these
 * values move real money" — which applies at least as strongly here.
 */
export const POST = route(async (request: Request) => {
  const session = await requireSuperAdmin();
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
