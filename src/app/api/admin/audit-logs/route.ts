import { parseQuery, route } from '@/lib/api/handler';
import { ok } from '@/lib/api/response';
import { requireSuperAdmin } from '@/lib/admin/guard';
import { listAuditLog } from '@/lib/admin/audit';
import { paginate } from '@/lib/validators/common';
import { auditQuerySchema } from '@/lib/validators/admin';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/audit-logs — M9's "who, what, when, before/after".
 *
 * Super Admin only. The audit log records who changed a price and who read a
 * health profile; a store admin being able to read it would let them see the
 * trail of everyone above them, and check whether their own actions had been
 * noticed.
 */
export const GET = route(async (request: Request) => {
  await requireSuperAdmin();
  const query = parseQuery(request, auditQuerySchema);

  const { entries, total } = await listAuditLog(
    {
      actorId: query.actorId,
      action: query.action,
      entityType: query.entityType,
      entityId: query.entityId,
    },
    paginate(query),
  );

  return ok({
    entries,
    page: query.page,
    perPage: query.perPage,
    total,
    hasMore: query.page * query.perPage < total,
  });
});
