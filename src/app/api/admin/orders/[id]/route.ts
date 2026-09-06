import { ApiError, route } from '@/lib/api/handler';
import { ok } from '@/lib/api/response';
import { requireStoreAdmin } from '@/lib/admin/guard';
import { getAdminOrderDetail } from '@/lib/admin/orders';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

/**
 * GET /api/admin/orders/:id — full detail for the order detail screen (M9):
 * items, bill, rider, status history, and the legal next statuses so the
 * detail page never offers an illegal transition.
 */
export const GET = route(async (_request: Request, context: Context) => {
  await requireStoreAdmin();
  const { id } = await context.params;

  const order = await getAdminOrderDetail(id);
  if (!order) throw ApiError.notFound('Order not found');

  return ok({ order });
});
