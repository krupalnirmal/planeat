import { parseQuery, route } from '@/lib/api/handler';
import { ok } from '@/lib/api/response';
import { requireStoreAdmin } from '@/lib/admin/guard';
import { db } from '@/lib/db';
import { renderNotification } from '@/lib/notifications/render';
import { adminListQuerySchema } from '@/lib/validators/admin';
import type { TemplateKey } from '@/lib/notifications/notify';

export const dynamic = 'force-dynamic';

const RECENT_LIMIT = 20;

/**
 * GET /api/admin/notifications — the bell's dropdown. IN_APP rows only (the
 * durable record every event gets, regardless of whether PUSH also fired) —
 * rendered server-side via the same `renderNotification` the cron sender
 * uses, so the client never re-implements template text.
 */
export const GET = route(async (request: Request) => {
  const session = await requireStoreAdmin();
  const { locale } = parseQuery(request, adminListQuerySchema);

  const rows = await db.notification.findMany({
    where: { userId: session.userId, channel: 'IN_APP' },
    orderBy: { createdAt: 'desc' },
    take: RECENT_LIMIT,
    select: { id: true, templateKey: true, payload: true, readAt: true, createdAt: true },
  });

  const notifications = rows.map((row) => ({
    id: row.id,
    ...renderNotification(row.templateKey as TemplateKey, locale, row.payload as Record<string, unknown>),
    orderId: (row.payload as Record<string, unknown>).orderId ?? null,
    read: row.readAt !== null,
    createdAt: row.createdAt,
  }));

  return ok({
    notifications,
    unreadCount: rows.filter((row) => row.readAt === null).length,
  });
});
