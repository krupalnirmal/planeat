import { beforeEach, describe, expect, it, vi } from 'vitest';
import { submitComplaintSchema, replyComplaintSchema } from '@/lib/validators/complaint';

/**
 * General complaint/feedback (session 2026-10-05) — mirrors
 * `tests/vendor.test.ts`'s `vi.hoisted()` + `vi.mock('@/lib/db')` pattern.
 */

const dbMock = vi.hoisted(() => ({
  complaint: { create: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
  auditLog: { create: vi.fn() },
}));

vi.mock('@/lib/db', () => ({ db: dbMock }));

import { listMyComplaints, submitComplaint } from '@/lib/complaints/complaints';
import { replyToComplaint } from '@/lib/admin/complaints';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('submitComplaint', () => {
  it('creates a row with status OPEN', async () => {
    dbMock.complaint.create.mockResolvedValue({});

    await submitComplaint({
      userId: 'usr_1',
      category: 'DELIVERY',
      description: 'The rider was very late today.',
      photoUrls: [],
    });

    expect(dbMock.complaint.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'usr_1',
          category: 'DELIVERY',
          status: 'OPEN',
        }),
      }),
    );
  });

  it('omits photoUrls from the write when none were given', async () => {
    dbMock.complaint.create.mockResolvedValue({});

    await submitComplaint({
      userId: 'usr_1',
      category: 'OTHER',
      description: 'Something else entirely, ten chars.',
      photoUrls: [],
    });

    const call = dbMock.complaint.create.mock.calls[0][0];
    expect(call.data.photoUrls).toBeUndefined();
  });

  it('passes photoUrls through when given', async () => {
    dbMock.complaint.create.mockResolvedValue({});

    await submitComplaint({
      userId: 'usr_1',
      category: 'PRODUCT_QUALITY',
      description: 'The tomatoes were rotten on arrival.',
      photoUrls: ['https://example.com/a.jpg'],
    });

    const call = dbMock.complaint.create.mock.calls[0][0];
    expect(call.data.photoUrls).toEqual(['https://example.com/a.jpg']);
  });
});

describe('listMyComplaints', () => {
  it('scopes the query to the given userId', async () => {
    dbMock.complaint.findMany.mockResolvedValue([]);

    await listMyComplaints('usr_42');

    expect(dbMock.complaint.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'usr_42' } }),
    );
  });

  it('defensively maps a non-array photoUrls to []', async () => {
    dbMock.complaint.findMany.mockResolvedValue([
      {
        id: 'cmp_1',
        category: 'OTHER',
        description: 'desc',
        photoUrls: null,
        status: 'OPEN',
        adminReply: null,
        createdAt: new Date(),
      },
    ]);

    const rows = await listMyComplaints('usr_42');
    expect(rows[0].photoUrls).toEqual([]);
  });
});

describe('replyToComplaint', () => {
  it('is not found for a missing complaint', async () => {
    dbMock.complaint.findUnique.mockResolvedValue(null);

    const result = await replyToComplaint('cmp_missing', 'Thanks for reporting.', 'usr_admin', null);

    expect(result).toEqual({ ok: false, reason: 'NOT_FOUND' });
    expect(dbMock.complaint.update).not.toHaveBeenCalled();
    expect(dbMock.auditLog.create).not.toHaveBeenCalled();
  });

  it('refuses to reply to an already-resolved complaint', async () => {
    dbMock.complaint.findUnique.mockResolvedValue({ status: 'RESOLVED', userId: 'usr_1' });

    const result = await replyToComplaint('cmp_1', 'Second reply.', 'usr_admin', null);

    expect(result).toEqual({ ok: false, reason: 'ALREADY_RESOLVED' });
    expect(dbMock.complaint.update).not.toHaveBeenCalled();
  });

  it('resolves the complaint, records the reply, and audits it', async () => {
    dbMock.complaint.findUnique.mockResolvedValue({ status: 'OPEN', userId: 'usr_1' });
    dbMock.complaint.update.mockResolvedValue({});

    const result = await replyToComplaint('cmp_1', 'We have refunded the item.', 'usr_admin', '1.2.3.4');

    expect(result).toEqual({ ok: true, userId: 'usr_1' });

    expect(dbMock.complaint.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'cmp_1' },
        data: expect.objectContaining({
          adminReply: 'We have refunded the item.',
          status: 'RESOLVED',
          resolvedBy: 'usr_admin',
          resolvedAt: expect.any(Date),
        }),
      }),
    );

    expect(dbMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          actorId: 'usr_admin',
          action: 'complaint.reply',
          entityType: 'Complaint',
          entityId: 'cmp_1',
        }),
      }),
    );
  });
});

describe('validators', () => {
  it('rejects a complaint description under 10 characters', () => {
    const result = submitComplaintSchema.safeParse({
      category: 'OTHER',
      description: 'too short',
      photoUrls: [],
    });
    expect(result.success).toBe(false);
  });

  it('accepts a well-formed complaint submission', () => {
    const result = submitComplaintSchema.safeParse({
      category: 'DELIVERY',
      description: 'The delivery was over an hour late today.',
      photoUrls: [],
    });
    expect(result.success).toBe(true);
  });

  it('rejects a reply under 5 characters', () => {
    const result = replyComplaintSchema.safeParse({ reply: 'ok' });
    expect(result.success).toBe(false);
  });

  it('accepts a well-formed reply', () => {
    const result = replyComplaintSchema.safeParse({ reply: 'Thanks, this has been resolved.' });
    expect(result.success).toBe(true);
  });
});
