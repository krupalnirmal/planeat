import { ApiError, clientIp, parseJson, route } from '@/lib/api/handler';
import { ok } from '@/lib/api/response';
import { requireStoreAdmin } from '@/lib/admin/guard';
import { addAlias } from '@/lib/admin/catalogue';
import { aliasSchema } from '@/lib/validators/admin';

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/aliases — M4's "alias dictionary managed in admin".
 *
 * The single highest-leverage action available to the owner. A customer's
 * voice note that failed to match is one row away from matching forever, and
 * unlike a model, the fix is visible, permanent and attributable.
 */
export const POST = route(async (request: Request) => {
  const session = await requireStoreAdmin();
  const input = await parseJson(request, aliasSchema);

  const result = await addAlias(
    input.productId,
    input.alias,
    input.locale,
    session.userId,
    clientIp(request),
  );

  if (!result.ok) {
    if (result.reason === 'DUPLICATE') throw ApiError.conflict('That alias already exists');
    throw ApiError.notFound('Product not found');
  }

  return ok({ added: true }, { status: 201 });
});
