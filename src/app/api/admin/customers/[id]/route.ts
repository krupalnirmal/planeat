import { ApiError, route } from '@/lib/api/handler';
import { ok } from '@/lib/api/response';
import { requireStoreAdmin } from '@/lib/admin/guard';
import { getCustomerDetail } from '@/lib/admin/customers';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

/**
 * GET /api/admin/customers/:id — profile, orders, wallet ledger (M9).
 *
 * S6 — the health profile is NOT here. It is a separate call that logs the
 * access and requires Super Admin, so a routine customer lookup never silently
 * reads sensitive medical data.
 */
export const GET = route(async (_request: Request, context: Context) => {
  await requireStoreAdmin();
  const { id } = await context.params;

  const customer = await getCustomerDetail(id);
  if (!customer) throw ApiError.notFound('Customer not found');

  return ok({ customer });
});
