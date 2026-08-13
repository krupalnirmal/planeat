import { db } from '@/lib/db';
import { ID_PREFIX, newId } from '@/lib/ids';
import { LEDGER_REF, credit, debit, getBalance } from './ledger';

/**
 * M7 — "Admin manual adjustment requires a reason and is audited."
 *
 * The reason is mandatory at the type level, not just in the form: an
 * unexplained credit in a financial ledger is indistinguishable from theft six
 * months later, and the person who has to explain it will not remember.
 *
 * The audit log row is written FIRST and its id becomes the ledger reference,
 * which makes the adjustment idempotent and gives every ledger entry a
 * traceable "who and why".
 *
 * The admin UI for this lands in Phase 8; the API and the audit trail are here
 * because they belong to M7's ledger, not to the panel that calls them.
 */

export interface AdjustWalletInput {
  userId: string;
  actorId: string;
  direction: 'CREDIT' | 'DEBIT';
  amountPaise: bigint;
  reason: string;
  ip?: string;
}

export type AdjustWalletResult =
  | { ok: true; transactionId: string; balancePaise: bigint }
  | { ok: false; reason: 'USER_NOT_FOUND' | 'INSUFFICIENT_BALANCE' | 'INVALID_AMOUNT' };

export async function adjustWallet(input: AdjustWalletInput): Promise<AdjustWalletResult> {
  if (input.amountPaise <= 0n) return { ok: false, reason: 'INVALID_AMOUNT' };

  const user = await db.user.findUnique({
    where: { id: input.userId },
    select: { id: true },
  });
  if (!user) return { ok: false, reason: 'USER_NOT_FOUND' };

  if (input.direction === 'DEBIT') {
    const balance = await getBalance(input.userId);
    if (balance < input.amountPaise) return { ok: false, reason: 'INSUFFICIENT_BALANCE' };
  }

  const auditId = newId(ID_PREFIX.auditLog);
  const balanceBefore = await getBalance(input.userId);

  const entry = await db.$transaction(async (tx) => {
    await tx.auditLog.create({
      data: {
        id: auditId,
        actorId: input.actorId,
        action: 'wallet.adjust',
        entityType: 'WalletTransaction',
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

    const record = input.direction === 'CREDIT' ? credit : debit;
    return record(
      {
        userId: input.userId,
        amountPaise: input.amountPaise,
        source: 'ADJUSTMENT',
        ...LEDGER_REF.adjustment(auditId),
        note: input.reason,
        createdBy: input.actorId,
      },
      tx,
    );
  });

  return {
    ok: true,
    transactionId: entry.transactionId,
    balancePaise: entry.balanceAfterPaise,
  };
}
