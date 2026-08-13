import { parseQuery, route } from '@/lib/api/handler';
import { ok } from '@/lib/api/response';
import { requireUser } from '@/lib/auth/session';
import { listWalletTransactions } from '@/lib/wallet/queries';
import { walletTransactionsQuerySchema } from '@/lib/validators/wallet';

export const dynamic = 'force-dynamic';

/**
 * GET /api/wallet/transactions — the statement, newest first, with filters.
 *
 * Each row carries the running balance recorded when it was written, not one
 * recomputed for this page. On a filtered view a recomputed column would look
 * like a running balance while silently skipping the rows you filtered out.
 */
export const GET = route(async (request: Request) => {
  const session = await requireUser();
  const query = parseQuery(request, walletTransactionsQuerySchema);

  const { transactions, total } = await listWalletTransactions(
    session.userId,
    { direction: query.direction, source: query.source },
    { skip: (query.page - 1) * query.perPage, take: query.perPage },
  );

  return ok({
    transactions,
    page: query.page,
    perPage: query.perPage,
    total,
    hasMore: query.page * query.perPage < total,
  });
});
