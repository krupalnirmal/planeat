import { db } from '@/lib/db';
import { getVendorBalance } from '@/lib/vendor/ledger';
import type { VendorLedgerDirection, VendorLedgerSource, VendorSupplyStatus } from '@/generated/prisma/enums';

/**
 * A vendor's own reads: their supply history, their payment/ledger history,
 * and their derived balance — all scoped to `vendorId`, never `userId`
 * directly, same reasoning as `src/lib/delivery/queries.ts`.
 */

export interface VendorSupplyRow {
  id: string;
  productName: string;
  variantLabel: string;
  quantity: number;
  costPricePaise: bigint;
  status: VendorSupplyStatus;
  rejectionReason: string | null;
  createdAt: Date;
  confirmedAt: Date | null;
}

export async function listMySupplies(vendorId: string): Promise<VendorSupplyRow[]> {
  const supplies = await db.vendorSupply.findMany({
    where: { vendorId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      quantity: true,
      costPricePaise: true,
      status: true,
      rejectionReason: true,
      createdAt: true,
      confirmedAt: true,
      variant: { select: { label: true, product: { select: { nameEn: true } } } },
    },
  });

  return supplies.map((supply) => ({
    id: supply.id,
    productName: supply.variant.product.nameEn,
    variantLabel: supply.variant.label,
    quantity: supply.quantity,
    costPricePaise: supply.costPricePaise,
    status: supply.status,
    rejectionReason: supply.rejectionReason,
    createdAt: supply.createdAt,
    confirmedAt: supply.confirmedAt,
  }));
}

export interface VendorLedgerRow {
  id: string;
  direction: VendorLedgerDirection;
  amountPaise: bigint;
  source: VendorLedgerSource;
  balanceAfterPaise: bigint;
  reason: string | null;
  createdAt: Date;
}

export async function listMyLedger(vendorId: string): Promise<VendorLedgerRow[]> {
  return db.vendorLedgerEntry.findMany({
    where: { vendorId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      direction: true,
      amountPaise: true,
      source: true,
      balanceAfterPaise: true,
      reason: true,
      createdAt: true,
    },
  });
}

export async function getMyBalance(vendorId: string): Promise<bigint> {
  return getVendorBalance(vendorId);
}

/** Active product variants a vendor can report a supply against. */
export async function listSuppliableVariants(): Promise<
  Array<{ id: string; label: string; productName: string }>
> {
  const variants = await db.productVariant.findMany({
    where: { isActive: true, product: { isActive: true } },
    orderBy: [{ product: { nameEn: 'asc' } }, { label: 'asc' }],
    select: { id: true, label: true, product: { select: { nameEn: true } } },
  });

  return variants.map((v) => ({ id: v.id, label: v.label, productName: v.product.nameEn }));
}
