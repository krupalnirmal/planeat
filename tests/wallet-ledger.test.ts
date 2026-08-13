import { beforeEach, describe, expect, it } from 'vitest';
import {
  InsufficientBalanceError,
  LEDGER_REF,
  type DbClient,
  credit,
  debit,
  getBalance,
  recordEntry,
} from '@/lib/wallet/ledger';

/**
 * R4 — the append-only wallet ledger.
 *
 * Run against an in-memory stand-in for the three Prisma calls the ledger
 * makes, so the suite stays database-free (R2). The fake enforces the same
 * unique constraint the schema does on `(source, ref_type, ref_id)`, which is
 * the mechanism the whole idempotency guarantee rests on.
 */

interface Row {
  id: string;
  userId: string;
  direction: 'CREDIT' | 'DEBIT';
  amountPaise: bigint;
  source: string;
  refType: string;
  refId: string;
  balanceAfterPaise: bigint;
}

class FakeLedgerDb {
  rows: Row[] = [];

  walletTransaction = {
    groupBy: async ({ where }: { where: { userId: string } }) => {
      const mine = this.rows.filter((row) => row.userId === where.userId);
      const directions: Array<'CREDIT' | 'DEBIT'> = ['CREDIT', 'DEBIT'];

      return directions
        .map((direction) => ({
          direction,
          _sum: {
            amountPaise: mine
              .filter((row) => row.direction === direction)
              .reduce((sum, row) => sum + row.amountPaise, 0n),
          },
        }))
        .filter((group) => mine.some((row) => row.direction === group.direction));
    },

    create: async ({ data }: { data: Row }) => {
      // The unique index from schema.prisma, enforced here.
      const clash = this.rows.some(
        (row) =>
          row.source === data.source && row.refType === data.refType && row.refId === data.refId,
      );
      if (clash) {
        throw Object.assign(new Error('Unique constraint failed'), {
          code: 'P2002',
          meta: { target: ['source', 'refType', 'refId'] },
        });
      }
      this.rows.push({ ...data });
      return { id: data.id, balanceAfterPaise: data.balanceAfterPaise };
    },

    findFirst: async ({
      where,
    }: {
      where: { source: string; refType: string; refId: string };
    }) => {
      const found = this.rows.find(
        (row) =>
          row.source === where.source &&
          row.refType === where.refType &&
          row.refId === where.refId,
      );
      return found ? { id: found.id, balanceAfterPaise: found.balanceAfterPaise } : null;
    },
  };
}

let fake: FakeLedgerDb;
let client: DbClient;

const USER = 'usr_test';

beforeEach(() => {
  fake = new FakeLedgerDb();
  client = fake as unknown as DbClient;
});

describe('derived balance', () => {
  it('is zero for a user with no transactions', async () => {
    expect(await getBalance(USER, client)).toBe(0n);
  });

  it('is credits minus debits', async () => {
    await credit(
      { userId: USER, amountPaise: 50_000n, source: 'TOPUP', refType: 'payment', refId: 'p1' },
      client,
    );
    await debit(
      { userId: USER, amountPaise: 20_000n, source: 'ORDER', ...LEDGER_REF.order('o1') },
      client,
    );
    expect(await getBalance(USER, client)).toBe(30_000n);
  });

  it('does not mix users', async () => {
    await credit(
      { userId: USER, amountPaise: 50_000n, source: 'TOPUP', refType: 'payment', refId: 'p1' },
      client,
    );
    await credit(
      { userId: 'usr_other', amountPaise: 99_000n, source: 'TOPUP', refType: 'payment', refId: 'p2' },
      client,
    );
    expect(await getBalance(USER, client)).toBe(50_000n);
  });
});

describe('idempotency on (source, refType, refId)', () => {
  it('credits exactly once however many times it is called', async () => {
    // PART 12 — "Replaying the same webhook payload ten times credits the
    // wallet exactly once." This is the mechanism that guarantees it.
    for (let i = 0; i < 10; i++) {
      await credit(
        {
          userId: USER,
          amountPaise: 50_000n,
          source: 'TOPUP',
          ...LEDGER_REF.payment('pay_abc'),
        },
        client,
      );
    }

    expect(fake.rows).toHaveLength(1);
    expect(await getBalance(USER, client)).toBe(50_000n);
  });

  it('reports alreadyRecorded on the repeat and returns the original id', async () => {
    const first = await credit(
      { userId: USER, amountPaise: 10_000n, source: 'REFUND', ...LEDGER_REF.orderRefund('o1') },
      client,
    );
    const second = await credit(
      { userId: USER, amountPaise: 10_000n, source: 'REFUND', ...LEDGER_REF.orderRefund('o1') },
      client,
    );

    expect(first.alreadyRecorded).toBe(false);
    expect(second.alreadyRecorded).toBe(true);
    expect(second.transactionId).toBe(first.transactionId);
  });

  it('refunds a cancelled order exactly once', async () => {
    // PART 12 — "Cancelling a PLACED order refunds the wallet exactly once."
    await credit(
      { userId: USER, amountPaise: 100_000n, source: 'TOPUP', refType: 'payment', refId: 'p1' },
      client,
    );
    await debit(
      { userId: USER, amountPaise: 30_000n, source: 'ORDER', ...LEDGER_REF.order('o1') },
      client,
    );

    await credit(
      { userId: USER, amountPaise: 30_000n, source: 'CANCELLATION', ...LEDGER_REF.orderRefund('o1') },
      client,
    );
    await credit(
      { userId: USER, amountPaise: 30_000n, source: 'CANCELLATION', ...LEDGER_REF.orderRefund('o1') },
      client,
    );

    expect(await getBalance(USER, client)).toBe(100_000n);
  });

  it('treats the same id under a different source as a separate entry', async () => {
    // An order debit and its refund share the order id but not the reference,
    // which is exactly why refType is part of the key.
    await debit(
      { userId: USER, amountPaise: 0n + 10_000n, source: 'ORDER', ...LEDGER_REF.order('o1') },
      client,
    ).catch(() => undefined);

    await credit(
      { userId: USER, amountPaise: 10_000n, source: 'TOPUP', refType: 'payment', refId: 'p1' },
      client,
    );
    await debit(
      { userId: USER, amountPaise: 10_000n, source: 'ORDER', ...LEDGER_REF.order('o1') },
      client,
    );
    await credit(
      { userId: USER, amountPaise: 10_000n, source: 'CANCELLATION', ...LEDGER_REF.orderRefund('o1') },
      client,
    );

    expect(fake.rows).toHaveLength(3);
  });
});

describe('debits', () => {
  it('refuse to overdraw', async () => {
    await credit(
      { userId: USER, amountPaise: 10_000n, source: 'TOPUP', refType: 'payment', refId: 'p1' },
      client,
    );

    await expect(
      debit(
        { userId: USER, amountPaise: 10_001n, source: 'ORDER', ...LEDGER_REF.order('o1') },
        client,
      ),
    ).rejects.toBeInstanceOf(InsufficientBalanceError);

    expect(await getBalance(USER, client)).toBe(10_000n);
  });

  it('allow spending the balance down to exactly zero', async () => {
    await credit(
      { userId: USER, amountPaise: 10_000n, source: 'TOPUP', refType: 'payment', refId: 'p1' },
      client,
    );
    await debit(
      { userId: USER, amountPaise: 10_000n, source: 'ORDER', ...LEDGER_REF.order('o1') },
      client,
    );
    expect(await getBalance(USER, client)).toBe(0n);
  });

  it('carry the shortfall on the error, so the UI can offer a top-up', async () => {
    await credit(
      { userId: USER, amountPaise: 5_000n, source: 'TOPUP', refType: 'payment', refId: 'p1' },
      client,
    );

    await expect(
      debit(
        { userId: USER, amountPaise: 20_000n, source: 'ORDER', ...LEDGER_REF.order('o1') },
        client,
      ),
    ).rejects.toMatchObject({ requiredPaise: 20_000n, availablePaise: 5_000n });
  });
});

describe('entry validation', () => {
  it('rejects a zero or negative amount', async () => {
    await expect(
      recordEntry(
        {
          userId: USER,
          direction: 'CREDIT',
          amountPaise: 0n,
          source: 'TOPUP',
          refType: 'payment',
          refId: 'p1',
        },
        client,
      ),
    ).rejects.toThrow();

    await expect(
      recordEntry(
        {
          userId: USER,
          direction: 'DEBIT',
          amountPaise: -100n,
          source: 'ORDER',
          refType: 'order',
          refId: 'o1',
        },
        client,
      ),
    ).rejects.toThrow();
  });

  it('records the running balance alongside each entry', async () => {
    await credit(
      { userId: USER, amountPaise: 50_000n, source: 'TOPUP', refType: 'payment', refId: 'p1' },
      client,
    );
    const second = await debit(
      { userId: USER, amountPaise: 20_000n, source: 'ORDER', ...LEDGER_REF.order('o1') },
      client,
    );

    expect(second.balanceAfterPaise).toBe(30_000n);
    expect(await getBalance(USER, client)).toBe(second.balanceAfterPaise);
  });
});
