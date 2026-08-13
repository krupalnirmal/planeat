import { z } from 'zod';
import { ApiError, parseJson, parseQuery, route } from '@/lib/api/handler';
import { ERROR_CODES, fail, ok } from '@/lib/api/response';
import { requireUser } from '@/lib/auth/session';
import { placeOrder } from '@/lib/orders/create';
import { listOrders } from '@/lib/orders/queries';
import { localeSchema, paginate, paginationSchema } from '@/lib/validators/common';
import { placeOrderSchema } from '@/lib/validators/order';

export const dynamic = 'force-dynamic';

const listQuerySchema = paginationSchema;
const createQuerySchema = z.object({ locale: localeSchema.default('mr') });

/** GET /api/orders — the caller's order history, newest first. */
export const GET = route(async (request: Request) => {
  const session = await requireUser();
  const query = parseQuery(request, listQuerySchema);

  const { orders, total } = await listOrders(session.userId, paginate(query));

  return ok({
    orders,
    page: query.page,
    perPage: query.perPage,
    total,
    hasMore: query.page * query.perPage < total,
  });
});

/**
 * POST /api/orders
 *
 * R5 — idempotent on the client-supplied key. Submitting twice returns the
 * same order with `duplicate: true`; it never creates a second one.
 *
 * Every failure gets its own error code so the UI can say something useful:
 * "add ₹40 more" is a different message from "someone just bought the last
 * kilo of onions".
 */
export const POST = route(async (request: Request) => {
  const session = await requireUser();
  const { locale } = parseQuery(request, createQuerySchema);
  const input = await parseJson(request, placeOrderSchema);

  const result = await placeOrder({
    userId: session.userId,
    addressId: input.addressId,
    paymentMethod: input.paymentMethod,
    deliverySlot: input.deliverySlot,
    idempotencyKey: input.idempotencyKey,
    notes: input.notes,
    locale,
  });

  if (result.ok) {
    return ok(
      { orderId: result.orderId, orderNumber: result.orderNumber, duplicate: result.duplicate },
      { status: result.duplicate ? 200 : 201 },
    );
  }

  switch (result.reason) {
    case 'EMPTY_CART':
      throw ApiError.badRequest('Your cart is empty');

    case 'ADDRESS_NOT_FOUND':
      throw ApiError.notFound('Delivery address not found');

    case 'NOT_SERVICEABLE':
      throw ApiError.notServiceable('We do not deliver to that address', {
        detail: result.detail,
      });

    case 'BELOW_MINIMUM':
      return fail(ERROR_CODES.BAD_REQUEST, 'Order is below the minimum value', 422, {
        reason: result.reason,
        minOrderValuePaise: result.minOrderValuePaise,
        itemTotalPaise: result.itemTotalPaise,
      });

    case 'PAYMENT_METHOD_UNAVAILABLE':
      return fail(ERROR_CODES.BAD_REQUEST, 'That payment method is not available', 422, {
        reason: result.reason,
        detail: result.detail,
      });

    case 'OUT_OF_STOCK':
      return fail(ERROR_CODES.OUT_OF_STOCK, 'Some items are no longer available', 409, {
        reason: result.reason,
        items: result.items,
      });

    case 'INSUFFICIENT_BALANCE':
      return fail(ERROR_CODES.INSUFFICIENT_BALANCE, 'Not enough balance in your wallet', 402, {
        reason: result.reason,
        requiredPaise: result.requiredPaise,
        availablePaise: result.availablePaise,
      });
  }
});
