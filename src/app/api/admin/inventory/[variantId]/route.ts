import { z } from 'zod';
import { ApiError, parseQuery, route } from '@/lib/api/handler';
import { ok } from '@/lib/api/response';
import { requirePermission } from '@/lib/admin/guard';
import { getVariantDetail } from '@/lib/admin/inventory';
import { localeSchema } from '@/lib/validators/common';

export const dynamic = 'force-dynamic';

const querySchema = z.object({ locale: localeSchema.default('mr') });

/** GET /api/admin/inventory/:variantId — dashboard v2's Inventory tab
    detail panel (session 2026-09-19, Part N): current stock/threshold/
    price plus the real stock-movement history already sitting in
    `AuditLog` (written by `bulkUpdateStock`), read back for the first
    time. */
export const GET = route(async (request: Request, context: { params: Promise<{ variantId: string }> }) => {
  await requirePermission('inventory');
  const { variantId } = await context.params;
  const { locale } = parseQuery(request, querySchema);

  const detail = await getVariantDetail(variantId, locale);
  if (!detail) throw ApiError.notFound('Variant not found');

  return ok(detail);
});
