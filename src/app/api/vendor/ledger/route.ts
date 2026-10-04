import { route } from '@/lib/api/handler';
import { ok } from '@/lib/api/response';
import { requireVendor } from '@/lib/vendor/guard';
import { listMyLedger } from '@/lib/vendor/queries';

export const dynamic = 'force-dynamic';

/** GET /api/vendor/ledger — the vendor's own payment/balance history. */
export const GET = route(async () => {
  const { vendorId } = await requireVendor();
  const entries = await listMyLedger(vendorId);
  return ok({
    entries: entries.map((e) => ({
      ...e,
      amountPaise: e.amountPaise.toString(),
      balanceAfterPaise: e.balanceAfterPaise.toString(),
    })),
  });
});
