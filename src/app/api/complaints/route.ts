import { parseJson, route } from '@/lib/api/handler';
import { ok } from '@/lib/api/response';
import { requireUser } from '@/lib/auth/session';
import { listMyComplaints, submitComplaint } from '@/lib/complaints/complaints';
import { submitComplaintSchema } from '@/lib/validators/complaint';

export const dynamic = 'force-dynamic';

/** GET /api/complaints — the logged-in customer's own complaint history. */
export const GET = route(async () => {
  const session = await requireUser();
  const complaints = await listMyComplaints(session.userId);
  return ok({ complaints });
});

/** POST /api/complaints — submit a new general complaint/feedback item. */
export const POST = route(async (request: Request) => {
  const session = await requireUser();
  const input = await parseJson(request, submitComplaintSchema);

  const result = await submitComplaint({
    userId: session.userId,
    category: input.category,
    description: input.description,
    photoUrls: input.photoUrls,
  });

  return ok({ complaintId: result.complaintId });
});
