import { db } from '@/lib/db';
import { ID_PREFIX, newId } from '@/lib/ids';

/**
 * General, non-order-scoped complaint/feedback (session 2026-10-05) —
 * mirrors `OrderIssue`'s status/resolution shape (`src/lib/orders/issues.ts`)
 * stripped of everything order/money-specific. Private: only the submitting
 * customer and admin staff (`src/lib/admin/complaints.ts`) ever see a row.
 */

export const COMPLAINT_CATEGORIES = [
  'PRODUCT_QUALITY',
  'DELIVERY',
  'APP_ISSUE',
  'BILLING',
  'STAFF_BEHAVIOUR',
  'OTHER',
] as const;
export type ComplaintCategory = (typeof COMPLAINT_CATEGORIES)[number];

export interface SubmitComplaintInput {
  userId: string;
  category: ComplaintCategory;
  description: string;
  photoUrls: string[];
}

export async function submitComplaint(input: SubmitComplaintInput): Promise<{ complaintId: string }> {
  const complaintId = newId(ID_PREFIX.complaint);
  await db.complaint.create({
    data: {
      id: complaintId,
      userId: input.userId,
      category: input.category,
      description: input.description,
      photoUrls: input.photoUrls.length > 0 ? input.photoUrls : undefined,
      status: 'OPEN',
    },
  });
  return { complaintId };
}

export interface MyComplaintRow {
  id: string;
  category: ComplaintCategory;
  description: string;
  photoUrls: string[];
  status: 'OPEN' | 'RESOLVED';
  adminReply: string | null;
  createdAt: Date;
}

export async function listMyComplaints(userId: string): Promise<MyComplaintRow[]> {
  const rows = await db.complaint.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      category: true,
      description: true,
      photoUrls: true,
      status: true,
      adminReply: true,
      createdAt: true,
    },
  });

  return rows.map((row) => ({
    id: row.id,
    category: row.category as ComplaintCategory,
    description: row.description,
    photoUrls: Array.isArray(row.photoUrls) ? (row.photoUrls as string[]) : [],
    status: row.status as 'OPEN' | 'RESOLVED',
    adminReply: row.adminReply,
    createdAt: row.createdAt,
  }));
}
