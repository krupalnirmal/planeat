import { db } from '@/lib/db';
import { SETTING_KEYS, getSettingPaise } from '@/lib/settings';
import type { WalletDirection, WalletSource } from '@/generated/prisma/enums';
import { getBalance } from './ledger';

/**
 * Wallet reads (M7): balance, and transaction history with a running balance.
 *
 * The running balance shown against each row is the stored
 * `balance_after_paise` snapshot, not something recomputed here. On a filtered
 * or paginated view, recomputing would produce a column that looks like a
 * running balance but silently omits the rows you filtered out — a statement
 * that does not add up is worse than no statement.
 */

export interface WalletTransactionView {
  id: string;
  direction: WalletDirection;
  amountPaise: bigint;
  source: WalletSource;
  refType: string;
  refId: string;
  balanceAfterPaise: bigint;
  note: string | null;
  createdAt: Date;
}

export interface WalletSummary {
  balancePaise: bigint;
  lowBalanceThresholdPaise: bigint;
  isLowBalance: boolean;
  /** A top-up already started but not yet confirmed by the webhook. */
  pendingTopupPaise: bigint;
}

export async function getWalletSummary(userId: string): Promise<WalletSummary> {
  const [balancePaise, lowBalanceThresholdPaise, pending] = await Promise.all([
    getBalance(userId),
    getSettingPaise(SETTING_KEYS.lowWalletThresholdPaise),
    db.payment.aggregate({
      where: { userId, status: 'PENDING' },
      _sum: { amountPaise: true },
    }),
  ]);

  return {
    balancePaise,
    lowBalanceThresholdPaise,
    // B10 — the low-balance alert threshold is ₹200 and lives in app_settings.
    isLowBalance: balancePaise < lowBalanceThresholdPaise,
    pendingTopupPaise: pending._sum.amountPaise ?? 0n,
  };
}

export interface TransactionFilter {
  direction?: WalletDirection;
  source?: WalletSource;
}

export async function listWalletTransactions(
  userId: string,
  filter: TransactionFilter,
  { skip, take }: { skip: number; take: number },
): Promise<{ transactions: WalletTransactionView[]; total: number }> {
  const where = {
    userId,
    ...(filter.direction ? { direction: filter.direction } : {}),
    ...(filter.source ? { source: filter.source } : {}),
  };

  const [transactions, total] = await Promise.all([
    db.walletTransaction.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take,
      select: {
        id: true,
        direction: true,
        amountPaise: true,
        source: true,
        refType: true,
        refId: true,
        balanceAfterPaise: true,
        note: true,
        createdAt: true,
      },
    }),
    db.walletTransaction.count({ where }),
  ]);

  return { transactions, total };
}

/**
 * The status of a top-up the browser is waiting on.
 *
 * The checkout callback tells the UI to start watching; this tells it whether
 * the webhook has landed. Nothing here credits anything.
 */
export async function getTopupStatus(
  paymentId: string,
  userId: string,
): Promise<{ status: 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED'; balancePaise: bigint } | null> {
  const payment = await db.payment.findUnique({
    where: { id: paymentId },
    select: { userId: true, status: true },
  });

  if (!payment || payment.userId !== userId) return null;

  return { status: payment.status, balancePaise: await getBalance(userId) };
}
