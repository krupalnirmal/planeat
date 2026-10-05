import { ApiError, clientIp, parseJson, route } from '@/lib/api/handler';
import { ok } from '@/lib/api/response';
import { requirePermission } from '@/lib/admin/guard';
import { getComplaintDetail, replyToComplaint } from '@/lib/admin/complaints';
import { replyComplaintSchema } from '@/lib/validators/complaint';
import { TEMPLATE } from '@/lib/notifications/notify';
import { notifyEventNow } from '@/lib/notifications/notify-now';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

/** GET /api/admin/complaints/:id — full detail for the admin detail screen. */
export const GET = route(async (_request: Request, context: Context) => {
  await requirePermission('customers');
  const { id } = await context.params;

  const complaint = await getComplaintDetail(id);
  if (!complaint) throw ApiError.notFound('Complaint not found');

  return ok({ complaint });
});

/** PATCH /api/admin/complaints/:id — reply + resolve, in one action. */
export const PATCH = route(async (request: Request, context: Context) => {
  const session = await requirePermission('customers');
  const { id } = await context.params;
  const input = await parseJson(request, replyComplaintSchema);

  const result = await replyToComplaint(id, input.reply, session.userId, clientIp(request));

  if (!result.ok) {
    throw result.reason === 'NOT_FOUND'
      ? ApiError.notFound('Complaint not found')
      : ApiError.conflict('This complaint has already been resolved');
  }

  await notifyEventNow(result.userId, TEMPLATE.complaintResolved, { complaintId: id });

  return ok({ complaintId: id, status: 'RESOLVED' });
});
