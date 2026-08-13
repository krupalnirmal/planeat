import { z } from 'zod';
import { clientIp, parseJson, parseQuery, route } from '@/lib/api/handler';
import { ok } from '@/lib/api/response';
import { requireStoreAdmin } from '@/lib/admin/guard';
import { assignRider, suggestRiders } from '@/lib/admin/orders';
import { defaultPicklistDate } from '@/lib/admin/picklist';
import { assignRiderSchema } from '@/lib/validators/admin';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const querySchema = z.object({ date: z.iso.date().optional() });

/**
 * GET /api/admin/riders/suggest — B12's suggestion, and nothing more.
 *
 *   "The system suggests; the owner confirms with one tap … No
 *    auto-assignment. With two or three riders the owner knows things the
 *    system does not."
 *
 * So this endpoint never writes an assignment. It returns who it would pick
 * and why, and the owner decides.
 */
export const GET = route(async (request: Request) => {
  await requireStoreAdmin();
  const { date } = parseQuery(request, querySchema);

  const suggestions = await suggestRiders(date ?? defaultPicklistDate());
  return ok({ suggestions });
});

/**
 * POST /api/admin/riders/suggest — B12's "Assign all suggested" bulk button.
 *
 * Takes explicit pairs rather than "apply your suggestions", so what the owner
 * saw on screen is exactly what gets written — even if a new order arrived in
 * between.
 */
export const POST = route(async (request: Request) => {
  const session = await requireStoreAdmin();
  const { assignments } = await parseJson(request, assignRiderSchema);
  const ip = clientIp(request);

  const assigned: string[] = [];
  const failed: Array<{ orderId: string; reason: string }> = [];

  for (const assignment of assignments) {
    const result = await assignRider(
      assignment.orderId,
      assignment.partnerId,
      session.userId,
      ip,
    );
    if (result.ok) assigned.push(assignment.orderId);
    else failed.push({ orderId: assignment.orderId, reason: result.reason });
  }

  return ok({ assigned: assigned.length, failed });
});
