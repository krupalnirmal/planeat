import { db } from '@/lib/db';
import { ID_PREFIX, newId } from '@/lib/ids';

/**
 * Push registration (M8). One user, several devices — a phone and, later, a
 * desktop PWA install — so tokens are keyed on `(userId, token)`, not on the
 * user alone.
 */
export async function registerPushToken(
  userId: string,
  token: string,
  platform: string,
): Promise<void> {
  await db.pushToken.upsert({
    where: { userId_token: { userId, token } },
    create: { id: newId(ID_PREFIX.pushToken), userId, token, platform },
    update: {},
  });
}

export async function tokensForUser(userId: string): Promise<string[]> {
  const rows = await db.pushToken.findMany({ where: { userId }, select: { token: true } });
  return rows.map((row) => row.token);
}

/** A provider reports these as permanently dead — stop sending to them. */
export async function removeInvalidTokens(tokens: readonly string[]): Promise<void> {
  if (tokens.length === 0) return;
  await db.pushToken.deleteMany({ where: { token: { in: [...tokens] } } });
}
