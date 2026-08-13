import { ApiError, parseQuery, route } from '@/lib/api/handler';
import { ok } from '@/lib/api/response';
import { requireUser } from '@/lib/auth/session';
import { getTopupStatus } from '@/lib/wallet/queries';
import { topupStatusQuerySchema } from '@/lib/validators/wallet';

export const dynamic = 'force-dynamic';

/**
 * GET /api/wallet/topup/status?paymentId=
 *
 * What the browser polls after the gateway's callback fires. It is a READ —
 * polling this never credits anything, so a customer refreshing it repeatedly
 * changes nothing.
 *
 * PART 12 — "Closing the browser mid-payment still yields a correct balance
 * once the webhook lands." Nothing about the credit depends on anyone being on
 * this page; it is only how the UI finds out.
 */
export const GET = route(async (request: Request) => {
  const session = await requireUser();
  const { paymentId } = parseQuery(request, topupStatusQuerySchema);

  const status = await getTopupStatus(paymentId, session.userId);
  if (!status) throw ApiError.notFound('Payment not found');

  return ok(status);
});
