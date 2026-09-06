import { z } from 'zod';
import { ApiError, parseQuery, route } from '@/lib/api/handler';
import { ok } from '@/lib/api/response';
import { requireStoreAdmin } from '@/lib/admin/guard';
import { getStorageProvider } from '@/lib/services/storage';
import { IMAGE_MIME_TYPES, MAX_IMAGE_BYTES } from '@/lib/validators/smart-list';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const querySchema = z.object({ folder: z.enum(['products']).default('products') });

/**
 * POST /api/admin/uploads/photo — a raw image body in, a storage URL out.
 *
 * M9's product image field needed the same "upload a photo, get back a URL"
 * primitive the delivery-proof flow already has (src/app/api/uploads/photo) —
 * that route is scoped to delivery partners, so this is the store-admin
 * equivalent rather than widening its RBAC.
 */
export const POST = route(async (request: Request) => {
  await requireStoreAdmin();
  const { folder } = parseQuery(request, querySchema);

  const mimeType = (request.headers.get('content-type') ?? '').split(';')[0].trim();
  if (!(IMAGE_MIME_TYPES as readonly string[]).includes(mimeType)) {
    throw ApiError.badRequest(`Unsupported image type "${mimeType}"`);
  }

  const buffer = Buffer.from(await request.arrayBuffer());
  if (buffer.byteLength === 0) throw ApiError.badRequest('The photo was empty');
  if (buffer.byteLength > MAX_IMAGE_BYTES) throw ApiError.badRequest('That photo is too large');

  const stored = await getStorageProvider().upload({
    data: buffer,
    mimeType,
    folder,
    fileName: 'product',
  });

  return ok({ url: stored.url }, { status: 201 });
});
