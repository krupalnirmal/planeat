import { ApiError, parseJson, route } from '@/lib/api/handler';
import { ok } from '@/lib/api/response';
import { requireUser } from '@/lib/auth/session';
import { reportIssue } from '@/lib/orders/issues';
import { reportIssueSchema } from '@/lib/validators/order';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

/**
 * POST /api/orders/:id/issue
 *
 * B14 — a photo-backed complaint under ₹100 is auto-credited to the wallet,
 * maximum 2 per customer per month. Anything above that goes to admin review.
 * The response says which happened and why, because "we'll look into it" and
 * "₹40 is back in your wallet" are very different answers.
 */
export const POST = route(async (request: Request, context: Context) => {
  const session = await requireUser();
  const { id } = await context.params;
  const input = await parseJson(request, reportIssueSchema);

  const result = await reportIssue({
    orderId: id,
    userId: session.userId,
    reasonCode: input.reasonCode,
    description: input.description,
    photoUrls: input.photoUrls,
    claimedPaise: BigInt(input.claimedPaise),
  });

  if (!result.ok) {
    switch (result.reason) {
      case 'ORDER_NOT_FOUND':
        throw ApiError.notFound('Order not found');
      case 'NOT_REPORTABLE':
        throw ApiError.conflict('You can report an issue once the order has been delivered');
      case 'ALREADY_REPORTED':
        throw ApiError.conflict('An issue is already open for this order');
    }
  }

  return ok({
    issueId: result.issueId,
    autoApproved: result.autoApproved,
    creditedPaise: result.creditedPaise,
    reviewReason: result.reviewReason,
  });
});
