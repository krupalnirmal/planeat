import { db } from '@/lib/db';
import { ID_PREFIX, newId } from '@/lib/ids';

/**
 * A vendor reporting what they're delivering. This is a self-reported claim
 * only — it has no effect on stock or the ledger until an admin confirms it
 * (`src/lib/admin/vendors.ts`'s `confirmSupply`), same "a human always
 * confirms" reasoning as rider assignment (`suggestRiders`/`assignRider`).
 */

export interface SubmitSupplyInput {
  variantId: string;
  quantity: number;
  costPricePaise: bigint;
}

export type SubmitSupplyResult = { ok: true; supplyId: string } | { ok: false; reason: 'VARIANT_NOT_FOUND' };

export async function submitSupply(
  vendorId: string,
  input: SubmitSupplyInput,
): Promise<SubmitSupplyResult> {
  const variant = await db.productVariant.findUnique({
    where: { id: input.variantId },
    select: { id: true },
  });
  if (!variant) return { ok: false, reason: 'VARIANT_NOT_FOUND' };

  const supplyId = newId(ID_PREFIX.vendorSupply);
  await db.vendorSupply.create({
    data: {
      id: supplyId,
      vendorId,
      variantId: input.variantId,
      quantity: input.quantity,
      costPricePaise: input.costPricePaise,
    },
  });

  return { ok: true, supplyId };
}
