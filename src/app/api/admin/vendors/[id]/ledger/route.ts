import { ApiError, clientIp, parseJson, route } from '@/lib/api/handler';
import { ok } from '@/lib/api/response';
import { requireSuperAdmin } from '@/lib/admin/guard';
import { adjustVendorLedger } from '@/lib/admin/vendors';
import { vendorLedgerAdjustSchema } from '@/lib/validators/admin';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

/**
 * POST /api/admin/vendors/:id/ledger — record a payment to (or correction
 * for) a vendor. SUPER_ADMIN-only, same reasoning as `wallet/adjust` —
 * this moves real money out of the business, not just an operational record.
 */
export const POST = route(async (request: Request, context: Context) => {
  const session = await requireSuperAdmin();
  const { id } = await context.params;
  const input = await parseJson(request, vendorLedgerAdjustSchema);

  const result = await adjustVendorLedger({
    vendorId: id,
    actorId: session.userId,
    direction: input.direction,
    amountPaise: BigInt(input.amountPaise),
    reason: input.reason,
    ip: clientIp(request),
  });

  if (!result.ok) {
    switch (result.reason) {
      case 'VENDOR_NOT_FOUND':
        throw ApiError.notFound('Vendor not found');
      case 'INVALID_AMOUNT':
        throw ApiError.badRequest('Amount must be greater than zero');
    }
  }

  return ok({ entryId: result.entryId, balancePaise: result.balancePaise.toString() });
});
