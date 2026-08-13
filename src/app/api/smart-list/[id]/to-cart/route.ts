import { z } from 'zod';
import { ApiError, parseQuery, route } from '@/lib/api/handler';
import { ok } from '@/lib/api/response';
import { requireUser } from '@/lib/auth/session';
import { addToCart } from '@/lib/cart/queries';
import { db } from '@/lib/db';
import { localeSchema } from '@/lib/validators/common';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const querySchema = z.object({ locale: localeSchema.default('mr') });

type Context = { params: Promise<{ id: string }> };

/**
 * POST /api/smart-list/:id/to-cart — the end of M4's flow.
 *
 * Only rows that are MATCHED or USER_CONFIRMED go in. Ambiguous and unmatched
 * rows are reported back so the review screen can say which ones were left
 * behind — M4's "unmatched items are clearly marked and never silently
 * dropped" has to survive this step, not just the screen before it.
 */
export const POST = route(async (request: Request, context: Context) => {
  const session = await requireUser();
  const { id } = await context.params;
  const { locale } = parseQuery(request, querySchema);

  const list = await db.smartList.findUnique({
    where: { id },
    select: {
      userId: true,
      items: {
        orderBy: { sortOrder: 'asc' },
        select: {
          id: true,
          rawText: true,
          parsedName: true,
          quantity: true,
          matchedVariantId: true,
          status: true,
        },
      },
    },
  });

  if (!list || list.userId !== session.userId) throw ApiError.notFound('That list was not found');

  const added: string[] = [];
  const skipped: Array<{ name: string; reason: string }> = [];

  for (const item of list.items) {
    const usable =
      (item.status === 'MATCHED' || item.status === 'USER_CONFIRMED') && item.matchedVariantId;

    if (!usable) {
      skipped.push({
        name: item.parsedName ?? item.rawText,
        reason: item.status === 'UNMATCHED' ? 'NOT_AVAILABLE' : 'NEEDS_CHOICE',
      });
      continue;
    }

    // The cart holds a count of variants, not grams. A spoken "दोन किलो" was
    // already resolved to the closest sellable variant at match time; here it
    // becomes one of that variant.
    const result = await addToCart(
      session.userId,
      { variantId: item.matchedVariantId as string, quantity: 1 },
      locale,
    );

    if (result.ok) added.push(item.parsedName ?? item.rawText);
    else skipped.push({ name: item.parsedName ?? item.rawText, reason: result.reason });
  }

  await db.smartList.update({ where: { id }, data: { status: 'CONVERTED' } });

  return ok({ added: added.length, addedNames: added, skipped });
});
