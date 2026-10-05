import { z } from 'zod';
import { parseQuery, route } from '@/lib/api/handler';
import { ok } from '@/lib/api/response';
import { requirePermission } from '@/lib/admin/guard';
import { listComplaints } from '@/lib/admin/complaints';

export const dynamic = 'force-dynamic';

const querySchema = z.object({ status: z.enum(['OPEN', 'RESOLVED']).optional() });

/** GET /api/admin/complaints — list, optionally filtered by status. */
export const GET = route(async (request: Request) => {
  await requirePermission('customers');
  const { status } = parseQuery(request, querySchema);
  const complaints = await listComplaints({ status });
  return ok({ complaints });
});
