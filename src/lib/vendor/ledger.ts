import { db } from '@/lib/db';
import { isUniqueViolation } from '@/lib/db-errors';
import { ID_PREFIX, newId } from '@/lib/ids';
import type { Prisma } from '@/generated/prisma/client';
import type { VendorLedgerSource } from '@/generated/prisma/enums';

/**
 * R4 — the vendor ledger is an APPEND-ONLY LEDGER, same shape and same
 * reasoning as `src/lib/wallet/ledger.ts`: balance is derived by summing
 * `vendor_ledger_entries`, never stored in a mutable column, and every
 * write is idempotent on `(source, refType, refId)` — that's what stops a
 * re-confirmed supply (or a double-clicked payment) from double-crediting.
 *
 * Unlike the wallet, a debit here (a payment OUT to the vendor) never
 * refuses for "insufficient balance" — paying a vendor in advance of what's
 * been confirmed is a normal, legitimate thing a business does, so there is
 * no `InsufficientBalanceError`/locking-read equivalent of `debit()` here.
 */

export type DbClient = Prisma.TransactionClient | typeof db;

export interface VendorLedgerEntryInput {
  vendorId: string;
  direction: 'CREDIT' | 'DEBIT';
  amountPaise: bigint;
  source: VendorLedgerSource;
  refType: string;
  refId: string;
  reason?: string;
}

export interface VendorLedgerResult {
  entryId: string;
  balanceAfterPaise: bigint;
  alreadyRecorded: boolean;
}

export async function getVendorBalance(vendorId: string, client: DbClient = db): Promise<bigint> {
  const groups = await client.vendorLedgerEntry.groupBy({
    by: ['direction'],
    where: { vendorId },
    _sum: { amountPaise: true },
  });

  let balance = 0n;
  for (const group of groups) {
    const sum = group._sum.amountPaise ?? 0n;
    balance += group.direction === 'CREDIT' ? sum : -sum;
  }
  return balance;
}

async function recordEntry(
  entry: VendorLedgerEntryInput,
  client: DbClient = db,
): Promise<VendorLedgerResult> {
  if (entry.amountPaise <= 0n) {
    throw new Error(`Ledger amount must be positive, got ${entry.amountPaise}`);
  }

  const balanceBefore = await getVendorBalance(entry.vendorId, client);
  const balanceAfter =
    entry.direction === 'CREDIT' ? balanceBefore + entry.amountPaise : balanceBefore - entry.amountPaise;

  try {
    const created = await client.vendorLedgerEntry.create({
      data: {
        id: newId(ID_PREFIX.vendorLedger),
        vendorId: entry.vendorId,
        direction: entry.direction,
        amountPaise: entry.amountPaise,
        source: entry.source,
        refType: entry.refType,
        refId: entry.refId,
        balanceAfterPaise: balanceAfter,
        reason: entry.reason ?? null,
      },
      select: { id: true, balanceAfterPaise: true },
    });

    return { entryId: created.id, balanceAfterPaise: created.balanceAfterPaise, alreadyRecorded: false };
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;

    // The same (source, refType, refId) is already on the ledger — expected
    // on a retry (e.g. a re-submitted confirm), not an error.
    const existing = await client.vendorLedgerEntry.findFirst({
      where: { source: entry.source, refType: entry.refType, refId: entry.refId },
      select: { id: true, balanceAfterPaise: true },
    });

    if (!existing) throw error;

    return { entryId: existing.id, balanceAfterPaise: existing.balanceAfterPaise, alreadyRecorded: true };
  }
}

export async function creditVendor(
  entry: Omit<VendorLedgerEntryInput, 'direction'>,
  client: DbClient = db,
): Promise<VendorLedgerResult> {
  return recordEntry({ ...entry, direction: 'CREDIT' }, client);
}

export async function debitVendor(
  entry: Omit<VendorLedgerEntryInput, 'direction'>,
  client: DbClient = db,
): Promise<VendorLedgerResult> {
  return recordEntry({ ...entry, direction: 'DEBIT' }, client);
}

/** Reference builders, so the same key is never spelled two ways. */
export const VENDOR_LEDGER_REF = {
  supply: (supplyId: string) => ({ refType: 'vendor_supply', refId: supplyId }),
  payment: (auditId: string) => ({ refType: 'vendor_payment', refId: auditId }),
  adjustment: (auditId: string) => ({ refType: 'adjustment', refId: auditId }),
} as const;
