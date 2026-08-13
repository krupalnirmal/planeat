import { db } from '@/lib/db';
import { ID_PREFIX, newId } from '@/lib/ids';
import { SETTING_KEYS, getSettingNumber, getSettingPaise } from '@/lib/settings';
import { LEDGER_REF, credit } from '@/lib/wallet/ledger';
import { isIssueReportable } from './status';

/**
 * B14 — quality complaints.
 *
 *   A photo-backed complaint under ₹100 is auto-credited to the wallet,
 *   maximum 2 per customer per month. Above that value or limit → admin
 *   review. Repeat patterns surface in admin.
 *
 * The point of the auto-credit is that a customer who got a bad tomato should
 * not have to argue about ₹40. The point of the limits is that the same
 * mechanism must not become a way to shop for free.
 */

export const ISSUE_REASON_CODES = [
  'QUALITY_POOR',
  'ITEM_MISSING',
  'WRONG_ITEM',
  'QUANTITY_SHORT',
  'DAMAGED',
  'LATE_DELIVERY',
  'OTHER',
] as const;

export type IssueReasonCode = (typeof ISSUE_REASON_CODES)[number];

export interface ReportIssueInput {
  orderId: string;
  userId: string;
  reasonCode: IssueReasonCode;
  description?: string;
  photoUrls: string[];
  /** What the customer says the affected items were worth. */
  claimedPaise: bigint;
}

export type ReportIssueResult =
  | {
      ok: true;
      issueId: string;
      autoApproved: boolean;
      creditedPaise: bigint;
      /** Why it went to review, when it did. */
      reviewReason: 'ABOVE_LIMIT' | 'MONTHLY_LIMIT' | 'NO_PHOTO' | null;
    }
  | { ok: false; reason: 'ORDER_NOT_FOUND' | 'NOT_REPORTABLE' | 'ALREADY_REPORTED' };

function startOfMonth(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export async function reportIssue(input: ReportIssueInput): Promise<ReportIssueResult> {
  const order = await db.order.findUnique({
    where: { id: input.orderId },
    select: { id: true, userId: true, orderNumber: true, status: true, totalPaise: true },
  });

  if (!order || order.userId !== input.userId) return { ok: false, reason: 'ORDER_NOT_FOUND' };

  // Nothing to complain about before the order has arrived — or failed to.
  if (!isIssueReportable(order.status)) return { ok: false, reason: 'NOT_REPORTABLE' };

  const alreadyOpen = await db.orderIssue.findFirst({
    where: { orderId: order.id, status: 'OPEN' },
    select: { id: true },
  });
  if (alreadyOpen) return { ok: false, reason: 'ALREADY_REPORTED' };

  const [autoCreditMaxPaise, monthlyLimit] = await Promise.all([
    getSettingPaise(SETTING_KEYS.complaintAutoCreditMaxPaise),
    getSettingNumber(SETTING_KEYS.complaintAutoCreditMonthlyLimit),
  ]);

  // Never credit more than the order was worth, whatever the customer claims.
  const claimedPaise =
    input.claimedPaise > order.totalPaise ? order.totalPaise : input.claimedPaise;

  const autoCreditsThisMonth = await db.orderIssue.count({
    where: {
      userId: input.userId,
      autoApproved: true,
      createdAt: { gte: startOfMonth(new Date()) },
    },
  });

  // B14 — a photo is what makes the auto-credit defensible. Without one it is
  // an unverifiable claim, so it goes to a human.
  let reviewReason: 'ABOVE_LIMIT' | 'MONTHLY_LIMIT' | 'NO_PHOTO' | null = null;
  if (input.photoUrls.length === 0) reviewReason = 'NO_PHOTO';
  else if (claimedPaise > autoCreditMaxPaise) reviewReason = 'ABOVE_LIMIT';
  else if (autoCreditsThisMonth >= monthlyLimit) reviewReason = 'MONTHLY_LIMIT';

  const autoApproved = reviewReason === null && claimedPaise > 0n;
  const issueId = newId(ID_PREFIX.orderIssue);

  await db.$transaction(async (tx) => {
    await tx.orderIssue.create({
      data: {
        id: issueId,
        orderId: order.id,
        userId: input.userId,
        reasonCode: input.reasonCode,
        description: input.description ?? null,
        photoUrls: input.photoUrls,
        claimedPaise,
        creditedPaise: autoApproved ? claimedPaise : 0n,
        autoApproved,
        status: autoApproved ? 'RESOLVED' : 'OPEN',
        resolvedAt: autoApproved ? new Date() : null,
      },
    });

    if (autoApproved) {
      await credit(
        {
          userId: input.userId,
          amountPaise: claimedPaise,
          source: 'COMPLAINT_CREDIT',
          ...LEDGER_REF.complaint(issueId),
          note: `Quality credit for order ${order.orderNumber}`,
        },
        tx,
      );
    }
  });

  return {
    ok: true,
    issueId,
    autoApproved,
    creditedPaise: autoApproved ? claimedPaise : 0n,
    reviewReason,
  };
}
