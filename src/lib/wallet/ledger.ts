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

interface BalanceGroupRow {
  direction: 'CREDIT' | 'DEBIT';
  total: bigint | number | string;
}

/**
 * Same balance `getBalance` computes, but as a LOCKING read — every row it
 * touches is locked, and a locking read always reads the latest committed
 * version, bypassing MySQL/TiDB's normal REPEATABLE READ snapshot.
 *
 * This distinction is the whole fix `debit` relies on below: locking an
 * unrelated row (tried first, session 2026-09-30) does NOT make a later
 * plain `SELECT` on this table see fresh data — verified live against real
 * TiDB, twice, with two genuinely concurrent transactions. Two ₹80 debits
 * against a ₹100 balance both "succeeded" and left the balance at ₹-60,
 * because the second transaction's plain `getBalance` call still returned
 * the pre-first-debit balance even though it had, by then, correctly waited
 * for a lock on the other row. Only making the balance read ITSELF a
 * `FOR UPDATE` read — confirmed live to correctly block the second debit
 * with `InsufficientBalanceError` and leave the balance at the exact right
 * ₹20 — actually closes the race.
 */
async function getBalanceForUpdate(userId: string, client: DbClient): Promise<bigint> {
  const rows = await client.$queryRaw<BalanceGroupRow[]>`
    SELECT direction, SUM(amountPaise) as total
    FROM wallet_transactions
    WHERE userId = ${userId}
    GROUP BY direction
    FOR UPDATE
  `;

  let balance = 0n;
  for (const row of rows) {
    const sum = BigInt(row.total);
    balance += row.direction === 'CREDIT' ? sum : -sum;
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
  /** `debit` already paid for a `FOR UPDATE` read to check sufficiency —
      passed through here so the stored `balanceAfterPaise` snapshot is
      computed from that same locked value instead of a second, separately
      racy plain read. Omitted by `credit`, which has no sufficiency check
      of its own to piggyback on. */
  knownBalanceBefore?: bigint,
): Promise<LedgerResult> {
  if (entry.amountPaise <= 0n) {
    throw new Error(`Ledger amount must be positive, got ${entry.amountPaise}`);
  }

  const balanceBefore = knownBalanceBefore ?? (await getBalance(entry.userId, client));
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
 *
 * Every caller of `debit` is documented to run inside a transaction, but
 * that alone does not stop two concurrent transactions for the SAME user
 * from both reading the same pre-debit balance and both passing this check
 * (a double-tapped checkout, or two open tabs, each placing a WALLET order
 * at once — found and fixed session 2026-09-30, see `getBalanceForUpdate`).
 * A no-op race-wise when `client` is the plain (non-transactional) `db` —
 * same caveat this function already documents for that misuse.
 */
export async function debit(entry: Omit<LedgerEntry, 'direction'>, client: DbClient = db) {
  const balance = await getBalanceForUpdate(entry.userId, client);
  if (balance < entry.amountPaise) {
    throw new InsufficientBalanceError(entry.amountPaise, balance);
  }
  return recordEntry({ ...entry, direction: 'DEBIT' }, client, balance);
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
