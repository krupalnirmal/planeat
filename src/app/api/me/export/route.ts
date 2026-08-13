import { route } from '@/lib/api/handler';
import { ok } from '@/lib/api/response';
import { requireUser } from '@/lib/auth/session';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * GET /api/me/export — data export (M1, M11).
 *
 * India's DPDP Act gives a person the right to their own data, and health
 * profiles make that obligation sharper (S6). Everything the account owns is
 * returned in one document, with no admin involvement needed.
 *
 * Deliberately scoped to the caller: there is no `?userId=` parameter, so this
 * route cannot become an accidental data-exfiltration endpoint.
 */
export const GET = route(async () => {
  const session = await requireUser();

  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: {
      id: true,
      phone: true,
      name: true,
      email: true,
      dob: true,
      gender: true,
      role: true,
      preferredLanguage: true,
      createdAt: true,
      addresses: true,
      healthProfile: true,
      orders: {
        orderBy: { placedAt: 'desc' },
        include: { items: true },
      },
      walletTransactions: { orderBy: { createdAt: 'desc' } },
      mealPlans: { include: { days: { include: { items: true } } } },
      subscriptions: true,
      smartLists: { include: { items: true } },
      notifications: { orderBy: { createdAt: 'desc' }, take: 200 },
    },
  });

  return ok({
    exportedAt: new Date().toISOString(),
    format: 'planeat.user-export.v1',
    user,
  });
});
