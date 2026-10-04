import { db } from '@/lib/db';
import { ID_PREFIX, newId } from '@/lib/ids';
import { VENDOR_LEDGER_REF, creditVendor, debitVendor, getVendorBalance } from '@/lib/vendor/ledger';
import type { VendorSupplyStatus } from '@/generated/prisma/enums';
import { audit } from './audit';

/**
 * The admin half of the Vendor role (session 2026-10-04) — mirrors
 * `src/lib/admin/delivery-partners.ts` for vendor CRUD, and
 * `src/lib/wallet/adjust.ts` for the ledger/payment side.
 *
 * A vendor cannot sign in to the vendor PWA (`requireVendor()`,
 * `src/lib/vendor/guard.ts`) until a row here links their phone number to a
 * `Vendor`. A vendor's reported supply never touches stock or the ledger on
 * its own — only `confirmSupply` does, same "a human always confirms"
 * reasoning as rider assignment (`suggestRiders`/`assignRider` never
 * auto-assign).
 */

export interface VendorRow {
  id: string;
  userId: string;
  name: string;
  phone: string;
  businessName: string;
  isActive: boolean;
  balancePaise: bigint;
  pendingSupplies: number;
}

export async function listVendors(): Promise<VendorRow[]> {
  const [vendors, pending] = await Promise.all([
    db.vendor.findMany({
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        userId: true,
        businessName: true,
        isActive: true,
        user: { select: { name: true, phone: true } },
      },
    }),
    db.vendorSupply.groupBy({
      by: ['vendorId'],
      where: { status: 'PENDING' },
      _count: { vendorId: true },
    }),
  ]);

  const pendingByVendor = new Map(pending.map((entry) => [entry.vendorId, entry._count.vendorId]));

  const rows = await Promise.all(
    vendors.map(async (vendor) => ({
      id: vendor.id,
      userId: vendor.userId,
      name: vendor.user.name ?? vendor.user.phone,
      phone: vendor.user.phone,
      businessName: vendor.businessName,
      isActive: vendor.isActive,
      balancePaise: await getVendorBalance(vendor.id),
      pendingSupplies: pendingByVendor.get(vendor.id) ?? 0,
    })),
  );

  return rows;
}

export interface CreateVendorInput {
  phone: string;
  name: string;
  businessName: string;
}

export type CreateVendorResult = { ok: true; vendorId: string } | { ok: false; reason: 'PHONE_IN_USE' };

/**
 * A vendor is a `User` with role `VENDOR` plus the vendor row. If the phone
 * number already belongs to a customer or staff account, this refuses rather
 * than silently promoting their role out from under them.
 */
export async function createVendor(
  input: CreateVendorInput,
  actorId: string,
  ip: string | null,
): Promise<CreateVendorResult> {
  const existing = await db.user.findUnique({ where: { phone: input.phone } });
  if (existing) return { ok: false, reason: 'PHONE_IN_USE' };

  const vendorId = newId(ID_PREFIX.vendor);

  await db.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: { id: newId(ID_PREFIX.user), phone: input.phone, name: input.name, role: 'VENDOR' },
    });

    await tx.vendor.create({
      data: { id: vendorId, userId: user.id, businessName: input.businessName },
    });
  });

  await audit({
    actorId,
    action: 'vendor.create',
    entityType: 'Vendor',
    entityId: vendorId,
    before: {},
    after: { phone: input.phone, name: input.name, businessName: input.businessName },
    ip,
  });

  return { ok: true, vendorId };
}

export type UpdateVendorResult = { ok: true } | { ok: false; reason: 'NOT_FOUND' };

export async function setVendorActive(
  vendorId: string,
  isActive: boolean,
  actorId: string,
  ip: string | null,
): Promise<UpdateVendorResult> {
  const before = await db.vendor.findUnique({ where: { id: vendorId }, select: { isActive: true } });
  if (!before) return { ok: false, reason: 'NOT_FOUND' };

  await db.vendor.update({ where: { id: vendorId }, data: { isActive } });

  await audit({
    actorId,
    action: 'vendor.update',
    entityType: 'Vendor',
    entityId: vendorId,
    before,
    after: { isActive },
    ip,
  });

  return { ok: true };
}

export interface VendorDetail {
  id: string;
  name: string;
  phone: string;
  businessName: string;
  isActive: boolean;
  balancePaise: bigint;
}

export async function getVendorDetail(vendorId: string): Promise<VendorDetail | null> {
  const vendor = await db.vendor.findUnique({
    where: { id: vendorId },
    select: {
      id: true,
      businessName: true,
      isActive: true,
      user: { select: { name: true, phone: true } },
    },
  });
  if (!vendor) return null;

  return {
    id: vendor.id,
    name: vendor.user.name ?? vendor.user.phone,
    phone: vendor.user.phone,
    businessName: vendor.businessName,
    isActive: vendor.isActive,
    balancePaise: await getVendorBalance(vendor.id),
  };
}

export interface VendorSupplyAdminRow {
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

export async function listVendorSupplies(vendorId: string): Promise<VendorSupplyAdminRow[]> {
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

  return supplies.map((s) => ({
    id: s.id,
    productName: s.variant.product.nameEn,
    variantLabel: s.variant.label,
    quantity: s.quantity,
    costPricePaise: s.costPricePaise,
    status: s.status,
    rejectionReason: s.rejectionReason,
    createdAt: s.createdAt,
    confirmedAt: s.confirmedAt,
  }));
}

export type ConfirmSupplyResult =
  | { ok: true }
  | { ok: false; reason: 'NOT_FOUND' | 'NOT_PENDING' };

/**
 * Confirming a supply is the one moment it has any real effect: stock goes
 * up by exactly what was reported, and the vendor is credited exactly what
 * it cost — both in the same transaction, so a crash between the two can
 * never leave stock up with nothing owed, or owed with nothing in stock.
 */
export async function confirmSupply(
  supplyId: string,
  actorId: string,
  ip: string | null,
): Promise<ConfirmSupplyResult> {
  const supply = await db.vendorSupply.findUnique({
    where: { id: supplyId },
    select: { id: true, vendorId: true, variantId: true, quantity: true, costPricePaise: true, status: true },
  });
  if (!supply) return { ok: false, reason: 'NOT_FOUND' };
  if (supply.status !== 'PENDING') return { ok: false, reason: 'NOT_PENDING' };

  const now = new Date();
  const totalCostPaise = BigInt(supply.quantity) * supply.costPricePaise;

  await db.$transaction(async (tx) => {
    await tx.productVariant.update({
      where: { id: supply.variantId },
      data: { stockQty: { increment: supply.quantity } },
    });

    await creditVendor(
      {
        vendorId: supply.vendorId,
        amountPaise: totalCostPaise,
        source: 'SUPPLY',
        ...VENDOR_LEDGER_REF.supply(supply.id),
        reason: `Stock supply confirmed (${supply.quantity} units)`,
      },
      tx,
    );

    await tx.vendorSupply.update({
      where: { id: supplyId },
      data: { status: 'CONFIRMED', confirmedAt: now },
    });
  });

  await audit({
    actorId,
    action: 'vendor_supply.confirm',
    entityType: 'VendorSupply',
    entityId: supplyId,
    before: { status: 'PENDING' },
    after: { status: 'CONFIRMED', quantity: supply.quantity, totalCostPaise: totalCostPaise.toString() },
    ip,
  });

  return { ok: true };
}

export async function rejectSupply(
  supplyId: string,
  reason: string,
  actorId: string,
  ip: string | null,
): Promise<ConfirmSupplyResult> {
  const supply = await db.vendorSupply.findUnique({
    where: { id: supplyId },
    select: { status: true },
  });
  if (!supply) return { ok: false, reason: 'NOT_FOUND' };
  if (supply.status !== 'PENDING') return { ok: false, reason: 'NOT_PENDING' };

  await db.vendorSupply.update({
    where: { id: supplyId },
    data: { status: 'REJECTED', rejectionReason: reason },
  });

  await audit({
    actorId,
    action: 'vendor_supply.reject',
    entityType: 'VendorSupply',
    entityId: supplyId,
    before: { status: 'PENDING' },
    after: { status: 'REJECTED', reason },
    ip,
  });

  return { ok: true };
}

export interface AdjustVendorLedgerInput {
  vendorId: string;
  actorId: string;
  direction: 'CREDIT' | 'DEBIT';
  amountPaise: bigint;
  reason: string;
  ip?: string | null;
}

export type AdjustVendorLedgerResult =
  | { ok: true; entryId: string; balancePaise: bigint }
  | { ok: false; reason: 'VENDOR_NOT_FOUND' | 'INVALID_AMOUNT' };

/**
 * Records a payment made to (or a manual correction for) a vendor. Unlike
 * `adjustWallet`, a DEBIT here is never refused for "insufficient balance" —
 * paying a vendor ahead of what's been confirmed is normal, not an error.
 */
export async function adjustVendorLedger(
  input: AdjustVendorLedgerInput,
): Promise<AdjustVendorLedgerResult> {
  if (input.amountPaise <= 0n) return { ok: false, reason: 'INVALID_AMOUNT' };

  const vendor = await db.vendor.findUnique({ where: { id: input.vendorId }, select: { id: true } });
  if (!vendor) return { ok: false, reason: 'VENDOR_NOT_FOUND' };

  const auditId = newId(ID_PREFIX.auditLog);
  const balanceBefore = await getVendorBalance(input.vendorId);

  const entry = await db.$transaction(async (tx) => {
    await tx.auditLog.create({
      data: {
        id: auditId,
        actorId: input.actorId,
        action: 'vendor_ledger.adjust',
        entityType: 'VendorLedgerEntry',
        entityId: auditId,
        before: { balancePaise: balanceBefore.toString() },
        after: {
          direction: input.direction,
          amountPaise: input.amountPaise.toString(),
          reason: input.reason,
        },
        ip: input.ip ?? null,
      },
    });

    // DEBIT is overwhelmingly "we paid the vendor" — CREDIT through this
    // generic admin control is a correction (real credits for stock mostly
    // come from `confirmSupply`'s own SUPPLY source instead).
    const record = input.direction === 'CREDIT' ? creditVendor : debitVendor;
    return record(
      {
        vendorId: input.vendorId,
        amountPaise: input.amountPaise,
        source: input.direction === 'DEBIT' ? 'PAYMENT' : 'ADJUSTMENT',
        ...VENDOR_LEDGER_REF.payment(auditId),
        reason: input.reason,
      },
      tx,
    );
  });

  return { ok: true, entryId: entry.entryId, balancePaise: entry.balanceAfterPaise };
}
