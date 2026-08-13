import { z } from 'zod';
import { ApiError, parseQuery, route } from '@/lib/api/handler';
import { ok } from '@/lib/api/response';
import { requireDeliveryPartner } from '@/lib/delivery/guard';
import { getStorageProvider } from '@/lib/services/storage';
import { IMAGE_MIME_TYPES, MAX_IMAGE_BYTES } from '@/lib/validators/smart-list';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const querySchema = z.object({ folder: z.enum(['delivery-proof']).default('delivery-proof') });

/**
 * POST /api/uploads/photo — a raw image body in, a storage URL out.
 *
 * M10's proof-of-delivery photo is the first thing that actually needs this;
 * `delivery-proof` was already reserved on the storage port's folder type
 * back in Phase 0 for exactly this. Scoped to delivery partners for now — the
 * one caller that exists — rather than opened to every signed-in user before
 * a second caller shows up to justify it.
 */
export const POST = route(async (request: Request) => {
  await requireDeliveryPartner();
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
    fileName: 'proof',
  });

  return ok({ url: stored.url }, { status: 201 });
});
