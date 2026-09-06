import { route } from '@/lib/api/handler';
import { ok } from '@/lib/api/response';
import { requireStoreAdmin } from '@/lib/admin/guard';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/notifications/read — marks every unread IN_APP
 * notification for the current admin as read. Bulk rather than per-row: the
 * bell's dropdown is "open it, everything in it is now seen," not a list
 * with its own individual read/unread affordance.
 */
export const POST = route(async () => {
  const session = await requireStoreAdmin();

  await db.notification.updateMany({
    where: { userId: session.userId, channel: 'IN_APP', readAt: null },
    data: { readAt: new Date() },
  });

  return ok({ marked: true });
});
