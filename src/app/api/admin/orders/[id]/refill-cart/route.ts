import { z } from 'zod';
import { ApiError, clientIp, parseQuery, route } from '@/lib/api/handler';
import { ok } from '@/lib/api/response';
import { requirePermission } from '@/lib/admin/guard';
import { audit } from '@/lib/admin/audit';
import { addToCart } from '@/lib/cart/queries';
import { db } from '@/lib/db';
import { getReorderLines } from '@/lib/orders/queries';
import { localeSchema } from '@/lib/validators/common';

export const dynamic = 'force-dynamic';

const querySchema = z.object({ locale: localeSchema.default('mr') });

/**
 * POST /api/admin/orders/:id/refill-cart — dashboard v2's "Reorder" action
 * (session 2026-09-18).
 *
 * The admin-triggered version of the customer's own reorder button
 * (`POST /api/orders/:id/reorder`): refills the order's customer's cart
 * with what's still sellable, reusing the exact same `getReorderLines` +
 * `addToCart` pair. Deliberately does NOT place a new order — an admin
 * silently placing an order or spending a customer's wallet balance on
 * their behalf, without the customer picking the address/payment method
 * themselves, is a real risk, not something to paper over. Support staff
 * use this when a customer calls asking to reorder; the customer still
 * checks out on their own.
 */
export const POST = route(async (request: Request, context: { params: Promise<{ id: string }> }) => {
  const session = await requirePermission('orders');
  const { id } = await context.params;
  const { locale } = parseQuery(request, querySchema);
  const ip = clientIp(request);

  const order = await db.order.findUnique({
    where: { id },
    select: { userId: true, user: { select: { name: true, phone: true } } },
  });
  if (!order) throw ApiError.notFound('Order not found');

  const lines = await getReorderLines(id, order.userId);
  if (!lines) throw ApiError.notFound('Order not found');

  const skipped = [...lines.unavailable];
  let added = 0;

  for (const line of lines.available) {
    const result = await addToCart(
      order.userId,
      { variantId: line.variantId, quantity: line.quantity },
      locale,
    );
    if (result.ok) added += 1;
    else skipped.push({ name: line.variantId, reason: 'OUT_OF_STOCK' });
  }

  await audit({
    actorId: session.userId,
    action: 'order.refill_cart',
    entityType: 'Order',
    entityId: id,
    after: { added, skippedCount: skipped.length },
    ip,
  });

  return ok({
    customerName: order.user.name ?? order.user.phone,
    added,
    skipped,
  });
});
