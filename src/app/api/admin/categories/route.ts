import { z } from 'zod';
import { parseQuery, route } from '@/lib/api/handler';
import { ok } from '@/lib/api/response';
import { requireStoreAdmin } from '@/lib/admin/guard';
import { listCategories } from '@/lib/admin/catalogue';
import { localeSchema } from '@/lib/validators/common';

export const dynamic = 'force-dynamic';

const querySchema = z.object({ locale: localeSchema.default('en') });

/** GET /api/admin/categories — all categories, active or not, for the
    product form's category dropdown (M9). */
export const GET = route(async (request: Request) => {
  await requireStoreAdmin();
  const { locale } = parseQuery(request, querySchema);

  const categories = await listCategories(locale);
  return ok({ categories });
});
