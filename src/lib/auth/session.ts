import { cookies } from 'next/headers';
import { ApiError } from '@/lib/api/handler';
import { db } from '@/lib/db';
import { env } from '@/lib/env';
import { ID_PREFIX, newId } from '@/lib/ids';
import type { UserRole } from '@/generated/prisma/enums';
import {
  type AccessClaims,
  hashToken,
  signAccessToken,
  signRefreshToken,
  ttlToSeconds,
  verifyAccessToken,
  verifyRefreshToken,
} from './jwt';

/**
 * Session handling (M1).
 *
 * Tokens live in httpOnly cookies, so no JavaScript on the page — ours or an
 * injected one — can read them. R9: every role check happens here, on the
 * server. A client-side role check is decoration, not security.
 */

export const ACCESS_COOKIE = 'ac_at';
export const REFRESH_COOKIE = 'ac_rt';

function cookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    secure: env.isProduction,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: maxAgeSeconds,
  };
}

/**
 * Issues a fresh token pair and records the refresh token so it can be
 * revoked. Called on OTP verification and on refresh (rotation).
 */
export async function startSession(user: {
  id: string;
  role: UserRole;
  phone: string;
}): Promise<{ accessToken: string; refreshToken: string }> {
  const tokenId = newId(ID_PREFIX.refreshToken);

  const accessToken = await signAccessToken({
    userId: user.id,
    role: user.role,
    phone: user.phone,
  });
  const refreshToken = await signRefreshToken({ userId: user.id, tokenId });

  const refreshTtl = ttlToSeconds(env.auth.refreshTokenTtl);
  await db.refreshToken.create({
    data: {
      id: tokenId,
      userId: user.id,
      tokenHash: await hashToken(refreshToken),
      expiresAt: new Date(Date.now() + refreshTtl * 1000),
    },
  });

  const jar = await cookies();
  jar.set(ACCESS_COOKIE, accessToken, cookieOptions(ttlToSeconds(env.auth.accessTokenTtl)));
  jar.set(REFRESH_COOKIE, refreshToken, cookieOptions(refreshTtl));

  return { accessToken, refreshToken };
}

/**
 * Rotates the refresh token. Reuse of an already-rotated token is treated as
 * theft: every session for that user is revoked rather than just the one.
 */
export async function rotateSession(): Promise<{ userId: string } | null> {
  const jar = await cookies();
  const presented = jar.get(REFRESH_COOKIE)?.value;
  if (!presented) return null;

  const claims = await verifyRefreshToken(presented);
  if (!claims) return null;

  const stored = await db.refreshToken.findUnique({ where: { id: claims.tokenId } });
  const presentedHash = await hashToken(presented);

  if (!stored || stored.tokenHash !== presentedHash || stored.expiresAt <= new Date()) {
    return null;
  }

  if (stored.revokedAt) {
    await db.refreshToken.updateMany({
      where: { userId: claims.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return null;
  }

  const user = await db.user.findUnique({
    where: { id: claims.userId },
    select: { id: true, role: true, phone: true, isActive: true },
  });
  if (!user || !user.isActive) return null;

  await db.refreshToken.update({
    where: { id: stored.id },
    data: { revokedAt: new Date() },
  });

  await startSession(user);
  return { userId: user.id };
}

export async function endSession(): Promise<void> {
  const jar = await cookies();
  const presented = jar.get(REFRESH_COOKIE)?.value;

  if (presented) {
    const claims = await verifyRefreshToken(presented);
    if (claims) {
      await db.refreshToken.updateMany({
        where: { id: claims.tokenId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
  }

  jar.delete(ACCESS_COOKIE);
  jar.delete(REFRESH_COOKIE);
}

/**
 * Silently renews the access token from the refresh token when the access
 * token is missing or has expired, so a page reload (or any request) after
 * the 15-minute access-token TTL doesn't look like a logout to the customer
 * — the refresh token is valid for 30 days and was sitting right there,
 * just never used for anything. Called once per request from `route()`
 * (src/lib/api/handler.ts), before the handler runs, so `getSession()` /
 * `requireUser()` inside the handler see an already-fresh cookie and
 * nothing downstream needs to change.
 *
 * Cheap for the common cases: a guest (no refresh-token cookie) or a still-
 * valid access token both return after a single JWT check, no DB round
 * trip. Only "access token expired, refresh token valid" pays for
 * `rotateSession()`'s DB read/writes — exactly the case this exists for.
 * Never throws: a failed refresh just leaves the request as unauthenticated,
 * same as before this existed.
 */
export async function ensureFreshSession(): Promise<void> {
  try {
    const jar = await cookies();
    const accessToken = jar.get(ACCESS_COOKIE)?.value;
    if (accessToken && (await verifyAccessToken(accessToken))) return;
    await rotateSession();
  } catch {
    // Best-effort — the request proceeds as unauthenticated if this fails.
  }
}

/** Null for a guest. Guests may browse the whole catalogue (B17). */
export async function getSession(): Promise<AccessClaims | null> {
  const jar = await cookies();
  const token = jar.get(ACCESS_COOKIE)?.value;
  if (!token) return null;
  return verifyAccessToken(token);
}

/** R9 — the server-side gate. Throws rather than returning null. */
export async function requireUser(): Promise<AccessClaims> {
  const session = await getSession();
  if (!session) throw ApiError.unauthorized();
  return session;
}

export const STORE_ROLES: UserRole[] = ['STORE_ADMIN', 'SUPER_ADMIN'];

export async function requireRole(...roles: UserRole[]): Promise<AccessClaims> {
  const session = await requireUser();
  if (!roles.includes(session.role)) throw ApiError.forbidden();
  return session;
}
