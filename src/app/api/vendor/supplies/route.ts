import { ApiError, parseJson, route } from '@/lib/api/handler';
import { ok } from '@/lib/api/response';
import { requireVendor } from '@/lib/vendor/guard';
import { listMySupplies } from '@/lib/vendor/queries';
import { submitSupply } from '@/lib/vendor/supplies';
import { submitSupplySchema } from '@/lib/validators/vendor';

export const dynamic = 'force-dynamic';

/** GET /api/vendor/supplies — the vendor's own supply history. */
export const GET = route(async () => {
  const { vendorId } = await requireVendor();
  const supplies = await listMySupplies(vendorId);
  return ok({
    supplies: supplies.map((s) => ({ ...s, costPricePaise: s.costPricePaise.toString() })),
  });
});

/**
 * POST /api/vendor/supplies — report a delivery of stock. This only
 * creates a PENDING claim; it has no effect on stock or the ledger until
 * an admin confirms it.
 */
export const POST = route(async (request: Request) => {
  const { vendorId } = await requireVendor();
  const input = await parseJson(request, submitSupplySchema);

  const result = await submitSupply(vendorId, {
    variantId: input.variantId,
    quantity: input.quantity,
    costPricePaise: BigInt(input.costPricePaise),
  });

  if (!result.ok) {
    throw ApiError.badRequest('That product could not be found');
  }

  return ok({ supplyId: result.supplyId });
});
