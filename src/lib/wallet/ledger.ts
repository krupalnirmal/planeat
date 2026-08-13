import { db } from '@/lib/db';
import { isUniqueViolation } from '@/lib/db-errors';
import { ID_PREFIX, newId } from '@/lib/ids';
import type { Prisma } from '@/generated/prisma/client';
import type { WalletSource } from '@/generated/prisma/enums';

/**
 * R4 — the wallet is an APPEND-ONLY LEDGER.
 *
 * Balance is derived by summing `wallet_transactions`, never stored in a
 * mutable column. A balance column drifts: one missed update, one partial
 * failure, one concurrent write, and the number on the screen stops matching
 * the transactions that produced it — with no way to tell which one is wrong.
 *
 * Every write is idempotent on `(source, ref_type, ref_id)`. That unique
 * constraint is what makes "run the job twice" harmless (R5) and what stops a
 * replayed payment webhook from double-crediting (P2).
 *
 * Phase 2 uses this for order debits and cancellation refunds. Phase 3 adds
 * top-ups, the Razorpay webhook and the transaction history UI.
 */

/** Anything that can run a query: the client, or a transaction handle. */
export type DbClient = Prisma.TransactionClient | typeof db;

export interface LedgerEntry {
  userId: string;
  direction: 'CREDIT' | 'DEBIT';
  amountPaise: bigint;
  source: WalletSource;
  /** What kind of thing this refers to, e.g. 'order', 'payment'. */
  refType: string;
  /** The id of that thing. Together with source and refType, unique. */
  refId: string;
  note?: string;
  /** Set when an admin made the entry on someone's behalf. */
  createdBy?: string;
}

export interface LedgerResult {
  transactionId: string;
  balanceAfterPaise: bigint;
  /** True when this exact entry already existed and nothing new was written. */
  alreadyRecorded: boolean;
}

export class InsufficientBalanceError extends Error {
  constructor(
    readonly requiredPaise: bigint,
    readonly availablePaise: bigint,
  ) {
    super('Not enough balance in the wallet');
    this.name = 'InsufficientBalanceError';
  }
}

/**
 * The derived balance: credits minus debits, in one grouped query.
 *
 * Pass the transaction handle when reading inside a transaction, or the read
 * will not see writes made earlier in that same transaction.
 */
export async function getBalance(userId: string, client: DbClient = db): Promise<bigint> {
  const groups = await client.walletTransaction.groupBy({
    by: ['direction'],
    where: { userId },
    _sum: { amountPaise: true },
  });

  let balance = 0n;
  for (const group of groups) {
    const sum = group._sum.amountPaise ?? 0n;
    balance += group.direction === 'CREDIT' ? sum : -sum;
  }
  return balance;
}

/**
 * Appends one entry. Safe to call twice with the same reference — the second
 * call returns the first entry's id and reports `alreadyRecorded`.
 *
 * Must be called inside a transaction whenever the caller is also writing the
 * thing being paid for, so an order and its debit either both exist or neither
 * does.
 */
export async function recordEntry(
  entry: LedgerEntry,
  client: DbClient = db,
): Promise<LedgerResult> {
  if (entry.amountPaise <= 0n) {
    throw new Error(`Ledger amount must be positive, got ${entry.amountPaise}`);
  }

  const balanceBefore = await getBalance(entry.userId, client);
  const balanceAfter =
    entry.direction === 'CREDIT'
      ? balanceBefore + entry.amountPaise
      : balanceBefore - entry.amountPaise;

  try {
    const created = await client.walletTransaction.create({
      data: {
        id: newId(ID_PREFIX.walletTransaction),
        userId: entry.userId,
        direction: entry.direction,
        amountPaise: entry.amountPaise,
        source: entry.source,
        refType: entry.refType,
        refId: entry.refId,
        // Stored for statements and audit. The authoritative balance is still
        // the sum of the table; this column is a snapshot, not a source.
        balanceAfterPaise: balanceAfter,
        note: entry.note ?? null,
        createdBy: entry.createdBy ?? null,
      },
      select: { id: true, balanceAfterPaise: true },
    });

    return {
      transactionId: created.id,
      balanceAfterPaise: created.balanceAfterPaise,
      alreadyRecorded: false,
    };
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;

    // The same (source, refType, refId) is already on the ledger. This is the
    // expected path on a retry, not an error.
    const existing = await client.walletTransaction.findFirst({
      where: { source: entry.source, refType: entry.refType, refId: entry.refId },
      select: { id: true, balanceAfterPaise: true },
    });

    if (!existing) throw error;

    return {
      transactionId: existing.id,
      balanceAfterPaise: existing.balanceAfterPaise,
      alreadyRecorded: true,
    };
  }
}

/**
 * Debits, refusing if the balance would go negative.
 *
 * The check and the write happen against the same client, so inside a
 * transaction they are consistent. Outside one they are not — always debit
 * inside the transaction that creates the order.
 */
export async function debit(entry: Omit<LedgerEntry, 'direction'>, client: DbClient = db) {
  const balance = await getBalance(entry.userId, client);
  if (balance < entry.amountPaise) {
    throw new InsufficientBalanceError(entry.amountPaise, balance);
  }
  return recordEntry({ ...entry, direction: 'DEBIT' }, client);
}

export async function credit(entry: Omit<LedgerEntry, 'direction'>, client: DbClient = db) {
  return recordEntry({ ...entry, direction: 'CREDIT' }, client);
}

/** Reference builders, so the same key is never spelled two ways. */
export const LEDGER_REF = {
  order: (orderId: string) => ({ refType: 'order', refId: orderId }),
  orderRefund: (orderId: string) => ({ refType: 'order_refund', refId: orderId }),
  payment: (gatewayPaymentId: string) => ({ refType: 'payment', refId: gatewayPaymentId }),
  planFee: (subscriptionId: string) => ({ refType: 'subscription', refId: subscriptionId }),
  complaint: (issueId: string) => ({ refType: 'order_issue', refId: issueId }),
  adjustment: (auditId: string) => ({ refType: 'adjustment', refId: auditId }),
} as const;
