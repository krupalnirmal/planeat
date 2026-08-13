import { ApiError, parseJson, route } from '@/lib/api/handler';
import { ok } from '@/lib/api/response';
import { requireUser } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { updateSmartListItemSchema } from '@/lib/validators/smart-list';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string; itemId: string }> };

/**
 * PATCH /api/smart-list/:id/items/:itemId — the review screen's edits.
 *
 * M4 — an ambiguous row shows the top 3 and the customer taps one. That choice
 * is recorded as `USER_CONFIRMED` rather than `MATCHED`, because it is a
 * different fact: the person told us, we did not work it out. The distinction
 * is what makes the alias table improvable — a row the customer had to correct
 * is exactly the alias the owner should add.
 */
export const PATCH = route(async (request: Request, context: Context) => {
  const session = await requireUser();
  const { id, itemId } = await context.params;
  const input = await parseJson(request, updateSmartListItemSchema);

  const item = await db.smartListItem.findUnique({
    where: { id: itemId },
    select: { id: true, smartListId: true, smartList: { select: { userId: true } } },
  });

  // R9 — ownership, and that the item belongs to the list in the URL.
  if (!item || item.smartListId !== id || item.smartList.userId !== session.userId) {
    throw ApiError.notFound('That item was not found');
  }

  if (input.remove) {
    await db.smartListItem.delete({ where: { id: itemId } });
    return ok({ removed: true });
  }

  // A chosen product must be real and sellable — the alternatives were
  // computed when the screen loaded, and stock moves.
  if (input.productId) {
    const product = await db.product.findUnique({
      where: { id: input.productId },
      select: {
        isActive: true,
        variants: {
          where: { isActive: true },
          orderBy: [{ isDefault: 'desc' }, { quantity: 'asc' }],
          take: 1,
          select: { id: true },
        },
      },
    });

    if (!product || !product.isActive) throw ApiError.notFound('That product is unavailable');

    await db.smartListItem.update({
      where: { id: itemId },
      data: {
        matchedProductId: input.productId,
        matchedVariantId: input.variantId ?? product.variants[0]?.id ?? null,
        ...(input.quantity !== undefined ? { quantity: input.quantity } : {}),
        confidence: 1,
        status: 'USER_CONFIRMED',
      },
    });

    return ok({ updated: true, status: 'USER_CONFIRMED' });
  }

  if (input.quantity !== undefined) {
    await db.smartListItem.update({
      where: { id: itemId },
      data: { quantity: input.quantity },
    });
    return ok({ updated: true });
  }

  throw ApiError.badRequest('Nothing to change');
});
