import { beforeEach, describe, expect, it } from 'vitest';
import {
  VENDOR_LEDGER_REF,
  type DbClient,
  creditVendor,
  debitVendor,
  getVendorBalance,
} from '@/lib/vendor/ledger';

/**
 * R4 — the append-only vendor ledger, same shape as the wallet ledger
 * (see `tests/wallet-ledger.test.ts`'s own doc comment for the fake-db
 * reasoning, R2 — database-free).
 */

interface Row {
  id: string;
  vendorId: string;
  direction: 'CREDIT' | 'DEBIT';
  amountPaise: bigint;
  source: string;
  refType: string;
  refId: string;
  balanceAfterPaise: bigint;
}

class FakeVendorLedgerDb {
  rows: Row[] = [];

  vendorLedgerEntry = {
    groupBy: async ({ where }: { where: { vendorId: string } }) => {
      const mine = this.rows.filter((row) => row.vendorId === where.vendorId);
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

let fake: FakeVendorLedgerDb;
let client: DbClient;

const VENDOR = 'vnd_test';

beforeEach(() => {
  fake = new FakeVendorLedgerDb();
  client = fake as unknown as DbClient;
});

describe('derived balance', () => {
  it('is zero for a vendor with no entries', async () => {
    expect(await getVendorBalance(VENDOR, client)).toBe(0n);
  });

  it('is credits minus debits', async () => {
    await creditVendor(
      { vendorId: VENDOR, amountPaise: 50_000n, source: 'SUPPLY', ...VENDOR_LEDGER_REF.supply('s1') },
      client,
    );
    await debitVendor(
      { vendorId: VENDOR, amountPaise: 20_000n, source: 'PAYMENT', ...VENDOR_LEDGER_REF.payment('a1') },
      client,
    );
    expect(await getVendorBalance(VENDOR, client)).toBe(30_000n);
  });

  it('does not mix vendors', async () => {
    await creditVendor(
      { vendorId: VENDOR, amountPaise: 50_000n, source: 'SUPPLY', ...VENDOR_LEDGER_REF.supply('s1') },
      client,
    );
    await creditVendor(
      { vendorId: 'vnd_other', amountPaise: 99_000n, source: 'SUPPLY', ...VENDOR_LEDGER_REF.supply('s2') },
      client,
    );
    expect(await getVendorBalance(VENDOR, client)).toBe(50_000n);
  });

  it('a debit can take the balance negative (advance payment is normal, not an error)', async () => {
    await debitVendor(
      { vendorId: VENDOR, amountPaise: 10_000n, source: 'PAYMENT', ...VENDOR_LEDGER_REF.payment('a1') },
      client,
    );
    expect(await getVendorBalance(VENDOR, client)).toBe(-10_000n);
  });
});

describe('idempotency on (source, refType, refId)', () => {
  it('credits exactly once however many times a supply is confirmed', async () => {
    // Mirrors the webhook-replay guarantee the wallet ledger has — a
    // re-confirmed supply (retry, double click) must never double-credit.
    for (let i = 0; i < 10; i++) {
      await creditVendor(
        { vendorId: VENDOR, amountPaise: 50_000n, source: 'SUPPLY', ...VENDOR_LEDGER_REF.supply('s1') },
        client,
      );
    }

    expect(fake.rows).toHaveLength(1);
    expect(await getVendorBalance(VENDOR, client)).toBe(50_000n);
  });

  it('reports alreadyRecorded on the repeat and returns the original id', async () => {
    const first = await creditVendor(
      { vendorId: VENDOR, amountPaise: 10_000n, source: 'SUPPLY', ...VENDOR_LEDGER_REF.supply('s1') },
      client,
    );
    const second = await creditVendor(
      { vendorId: VENDOR, amountPaise: 10_000n, source: 'SUPPLY', ...VENDOR_LEDGER_REF.supply('s1') },
      client,
    );

    expect(first.alreadyRecorded).toBe(false);
    expect(second.alreadyRecorded).toBe(true);
    expect(second.entryId).toBe(first.entryId);
  });
});

describe('entry validation', () => {
  it('rejects a zero or negative amount', async () => {
    await expect(
      creditVendor(
        { vendorId: VENDOR, amountPaise: 0n, source: 'SUPPLY', ...VENDOR_LEDGER_REF.supply('s1') },
        client,
      ),
    ).rejects.toThrow();

    await expect(
      debitVendor(
        { vendorId: VENDOR, amountPaise: -100n, source: 'PAYMENT', ...VENDOR_LEDGER_REF.payment('a1') },
        client,
      ),
    ).rejects.toThrow();
  });

  it('records the running balance alongside each entry', async () => {
    await creditVendor(
      { vendorId: VENDOR, amountPaise: 50_000n, source: 'SUPPLY', ...VENDOR_LEDGER_REF.supply('s1') },
      client,
    );
    const second = await debitVendor(
      { vendorId: VENDOR, amountPaise: 20_000n, source: 'PAYMENT', ...VENDOR_LEDGER_REF.payment('a1') },
      client,
    );

    expect(second.balanceAfterPaise).toBe(30_000n);
    expect(await getVendorBalance(VENDOR, client)).toBe(second.balanceAfterPaise);
  });
});
