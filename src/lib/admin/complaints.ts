import { db } from '@/lib/db';
import { audit } from './audit';
import type { ComplaintCategory } from '@/lib/complaints/complaints';

/**
 * The admin half of the Complaints feature (session 2026-10-05) — mirrors
 * `src/lib/admin/vendors.ts`'s list/detail/action shape.
 */

export interface AdminComplaintRow {
  id: string;
  userId: string;
  userName: string;
  userPhone: string;
  category: ComplaintCategory;
  description: string;
  photoUrls: string[];
  status: 'OPEN' | 'RESOLVED';
  createdAt: Date;
}

export interface ListComplaintsFilter {
  status?: 'OPEN' | 'RESOLVED';
}

export async function listComplaints(filter: ListComplaintsFilter): Promise<AdminComplaintRow[]> {
  const rows = await db.complaint.findMany({
    where: filter.status ? { status: filter.status } : undefined,
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      userId: true,
      category: true,
      description: true,
      photoUrls: true,
      status: true,
      createdAt: true,
      user: { select: { name: true, phone: true } },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    userId: row.userId,
    userName: row.user.name ?? row.user.phone,
    userPhone: row.user.phone,
    category: row.category as ComplaintCategory,
    description: row.description,
    photoUrls: Array.isArray(row.photoUrls) ? (row.photoUrls as string[]) : [],
    status: row.status as 'OPEN' | 'RESOLVED',
    createdAt: row.createdAt,
  }));
}

export interface AdminComplaintDetail extends AdminComplaintRow {
  adminReply: string | null;
  resolvedBy: string | null;
  resolvedAt: Date | null;
}

export async function getComplaintDetail(complaintId: string): Promise<AdminComplaintDetail | null> {
  const row = await db.complaint.findUnique({
    where: { id: complaintId },
    select: {
      id: true,
      userId: true,
      category: true,
      description: true,
      photoUrls: true,
      status: true,
      adminReply: true,
      resolvedBy: true,
      resolvedAt: true,
      createdAt: true,
      user: { select: { name: true, phone: true } },
    },
  });
  if (!row) return null;

  return {
    id: row.id,
    userId: row.userId,
    userName: row.user.name ?? row.user.phone,
    userPhone: row.user.phone,
    category: row.category as ComplaintCategory,
    description: row.description,
    photoUrls: Array.isArray(row.photoUrls) ? (row.photoUrls as string[]) : [],
    status: row.status as 'OPEN' | 'RESOLVED',
    adminReply: row.adminReply,
    resolvedBy: row.resolvedBy,
    resolvedAt: row.resolvedAt,
    createdAt: row.createdAt,
  };
}

export type ReplyToComplaintResult =
  | { ok: true; userId: string }
  | { ok: false; reason: 'NOT_FOUND' | 'ALREADY_RESOLVED' };

/**
 * A reply always resolves the complaint — this phase has no "reply and keep
 * open" path. Returns the owning `userId` so the route can notify the
 * customer without a second lookup.
 */
export async function replyToComplaint(
  complaintId: string,
  reply: string,
  actorId: string,
  ip: string | null,
): Promise<ReplyToComplaintResult> {
  const before = await db.complaint.findUnique({
    where: { id: complaintId },
    select: { status: true, userId: true },
  });
  if (!before) return { ok: false, reason: 'NOT_FOUND' };
  if (before.status === 'RESOLVED') return { ok: false, reason: 'ALREADY_RESOLVED' };

  await db.complaint.update({
    where: { id: complaintId },
    data: { adminReply: reply, status: 'RESOLVED', resolvedBy: actorId, resolvedAt: new Date() },
  });

  await audit({
    actorId,
    action: 'complaint.reply',
    entityType: 'Complaint',
    entityId: complaintId,
    before: { status: 'OPEN' },
    after: { status: 'RESOLVED', reply },
    ip,
  });

  return { ok: true, userId: before.userId };
}
