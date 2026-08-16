import { SignJWT, jwtVerify } from 'jose';
import { env } from '@/lib/env';
import type { UserRole } from '@/generated/prisma/enums';

/**
 * Custom JWT auth with `jose` (PART 4).
 *
 * `jose` is Web Crypto based, so this runs unchanged on Node, the Edge runtime
 * and Cloudflare Workers (R11). Access and refresh tokens are signed with
 * *different* secrets: leaking the short-lived access secret must not let an
 * attacker mint 30-day refresh tokens.
 */

const ISSUER = 'getfresh';
const AUDIENCE_ACCESS = 'getfresh:access';
const AUDIENCE_REFRESH = 'getfresh:refresh';

export interface AccessClaims {
  userId: string;
  role: UserRole;
  phone: string;
}

export interface RefreshClaims {
  userId: string;
  /** Identifies the stored `refresh_tokens` row, so it can be revoked. */
  tokenId: string;
}

function secret(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

export async function signAccessToken(claims: AccessClaims): Promise<string> {
  return new SignJWT({ role: claims.role, phone: claims.phone })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(claims.userId)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE_ACCESS)
    .setIssuedAt()
    .setExpirationTime(env.auth.accessTokenTtl)
    .sign(secret(env.auth.jwtSecret));
}

export async function signRefreshToken(claims: RefreshClaims): Promise<string> {
  return new SignJWT({ tokenId: claims.tokenId })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(claims.userId)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE_REFRESH)
    .setIssuedAt()
    .setExpirationTime(env.auth.refreshTokenTtl)
    .sign(secret(env.auth.jwtRefreshSecret));
}

/** Returns null rather than throwing: an expired token is an expected state. */
export async function verifyAccessToken(token: string): Promise<AccessClaims | null> {
  try {
    const { payload } = await jwtVerify(token, secret(env.auth.jwtSecret), {
      issuer: ISSUER,
      audience: AUDIENCE_ACCESS,
    });
    if (!payload.sub || typeof payload.role !== 'string') return null;
    return {
      userId: payload.sub,
      role: payload.role as UserRole,
      phone: typeof payload.phone === 'string' ? payload.phone : '',
    };
  } catch {
    return null;
  }
}

export async function verifyRefreshToken(token: string): Promise<RefreshClaims | null> {
  try {
    const { payload } = await jwtVerify(token, secret(env.auth.jwtRefreshSecret), {
      issuer: ISSUER,
      audience: AUDIENCE_REFRESH,
    });
    if (!payload.sub || typeof payload.tokenId !== 'string') return null;
    return { userId: payload.sub, tokenId: payload.tokenId };
  } catch {
    return null;
  }
}

/**
 * Refresh tokens are stored hashed, never in plain text: a database leak must
 * not hand an attacker 30 days of every user's session.
 */
export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Turns "15m" / "30d" into seconds, for cookie max-age. */
export function ttlToSeconds(ttl: string): number {
  const match = /^(\d+)([smhd])$/.exec(ttl.trim());
  if (!match) return 0;
  const value = Number(match[1]);
  const multiplier = { s: 1, m: 60, h: 3600, d: 86400 }[match[2]] ?? 1;
  return value * multiplier;
}
