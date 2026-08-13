import { route } from '@/lib/api/handler';
import { ok } from '@/lib/api/response';
import { requireUser } from '@/lib/auth/session';
import { getWalletSummary } from '@/lib/wallet/queries';
import { minimumTopupPaise, topupPresets } from '@/lib/wallet/topup';

export const dynamic = 'force-dynamic';

/**
 * GET /api/wallet — balance, low-balance flag and the top-up chips.
 *
 * R4 — the balance is derived by summing the ledger on every read. There is no
 * balance column to go stale, so this number and the transaction list below it
 * can never disagree.
 */
export const GET = route(async () => {
  const session = await requireUser();
  const summary = await getWalletSummary(session.userId);

  return ok({
    ...summary,
    // M7 — quick top-up chips, configurable from the environment.
    topupPresetsPaise: topupPresets(),
    minimumTopupPaise: minimumTopupPaise(),
  });
});
