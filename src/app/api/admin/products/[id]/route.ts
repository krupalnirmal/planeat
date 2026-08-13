import { ApiError, clientIp, parseJson, route } from '@/lib/api/handler';
import { ok } from '@/lib/api/response';
import { requireStoreAdmin } from '@/lib/admin/guard';
import { updateProduct, upsertVariant } from '@/lib/admin/catalogue';
import { productPatchSchema, variantSchema } from '@/lib/validators/admin';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

/** PATCH /api/admin/products/:id — edit a product (M9). */
export const PATCH = route(async (request: Request, context: Context) => {
  const session = await requireStoreAdmin();
  const { id } = await context.params;
  const input = await parseJson(request, productPatchSchema);

  const result = await updateProduct(id, input, session.userId, clientIp(request));

  if (!result.ok) {
    if (result.reason === 'DUPLICATE_SKU') throw ApiError.conflict('That SKU already exists');
    if (result.reason === 'CATEGORY_NOT_FOUND') throw ApiError.notFound('Category not found');
    throw ApiError.notFound('Product not found');
  }

  return ok({ productId: id });
});

/**
 * PUT /api/admin/products/:id — create or update one of its variants.
 *
 * Exactly one variant per product carries `isDefault`, enforced inside the
 * transaction. Two defaults would make the product card and the meal plan
 * disagree about which size is being priced.
 */
export const PUT = route(async (request: Request, context: Context) => {
  const session = await requireStoreAdmin();
  const { id } = await context.params;
  const input = await parseJson(request, variantSchema);

  const result = await upsertVariant(
    id,
    input.variantId ?? null,
    {
      label: input.label,
      quantity: input.quantity,
      unit: input.unit,
      mrpPaise: BigInt(input.mrpPaise),
      pricePaise: BigInt(input.pricePaise),
      stockQty: input.stockQty,
      lowStockThreshold: input.lowStockThreshold,
      isDefault: input.isDefault,
      isActive: input.isActive,
    },
    session.userId,
    clientIp(request),
  );

  if (!result.ok) throw ApiError.notFound('Product not found');

  return ok({ variantId: result.variantId });
});
