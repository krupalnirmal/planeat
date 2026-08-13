import { describe, expect, it } from 'vitest';
import {
  hashToken,
  signAccessToken,
  signRefreshToken,
  ttlToSeconds,
  verifyAccessToken,
  verifyRefreshToken,
} from '@/lib/auth/jwt';
import { isValidIndianMobile, normalisePhone } from '@/lib/auth/otp';
import { phoneSchema, pincodeSchema } from '@/lib/validators/common';

/**
 * M1 auth primitives. Everything here is pure or crypto-only, so it runs
 * without a database (R2 — the suite never touches a real service).
 */

describe('phone normalisation', () => {
  it('strips the country code, leading zero and formatting', () => {
    expect(normalisePhone('+91 98765 43210')).toBe('9876543210');
    expect(normalisePhone('919876543210')).toBe('9876543210');
    expect(normalisePhone('09876543210')).toBe('9876543210');
    expect(normalisePhone('98765-43210')).toBe('9876543210');
  });

  it('accepts only real Indian mobile prefixes', () => {
    expect(isValidIndianMobile('9876543210')).toBe(true);
    expect(isValidIndianMobile('6123456789')).toBe(true);
    // Indian mobile numbers never start below 6.
    expect(isValidIndianMobile('5876543210')).toBe(false);
    expect(isValidIndianMobile('123456789')).toBe(false);
    expect(isValidIndianMobile('')).toBe(false);
  });

  it('is shared with the Zod schema the API validates against', () => {
    expect(phoneSchema.parse('+91 98765 43210')).toBe('9876543210');
    expect(phoneSchema.safeParse('5876543210').success).toBe(false);
  });
});

describe('pincode schema', () => {
  it('accepts a seeded pincode and rejects a leading zero', () => {
    expect(pincodeSchema.safeParse('414102').success).toBe(true);
    expect(pincodeSchema.safeParse('014102').success).toBe(false);
  });
});

describe('JWT', () => {
  const user = { userId: 'usr_1', role: 'CUSTOMER' as const, phone: '9876543210' };

  it('round-trips an access token', async () => {
    const token = await signAccessToken(user);
    const claims = await verifyAccessToken(token);
    expect(claims).toEqual(user);
  });

  it('round-trips a refresh token', async () => {
    const token = await signRefreshToken({ userId: 'usr_1', tokenId: 'rft_1' });
    const claims = await verifyRefreshToken(token);
    expect(claims).toEqual({ userId: 'usr_1', tokenId: 'rft_1' });
  });

  it('rejects a tampered token instead of throwing', async () => {
    const token = await signAccessToken(user);
    const tampered = `${token.slice(0, -4)}aaaa`;
    expect(await verifyAccessToken(tampered)).toBeNull();
  });

  it('will not accept a refresh token as an access token', async () => {
    // Different secret AND different audience: leaking the short-lived access
    // secret must not let anyone mint 30-day sessions, and vice versa.
    const refresh = await signRefreshToken({ userId: 'usr_1', tokenId: 'rft_1' });
    expect(await verifyAccessToken(refresh)).toBeNull();
  });

  it('will not accept an access token as a refresh token', async () => {
    const access = await signAccessToken(user);
    expect(await verifyRefreshToken(access)).toBeNull();
  });

  it('rejects a malformed string', async () => {
    expect(await verifyAccessToken('not-a-jwt')).toBeNull();
    expect(await verifyAccessToken('')).toBeNull();
  });
});

describe('refresh token hashing', () => {
  it('is deterministic and does not leak the token', async () => {
    const token = await signRefreshToken({ userId: 'usr_1', tokenId: 'rft_1' });
    const hash = await hashToken(token);

    expect(hash).toHaveLength(64);
    expect(hash).toBe(await hashToken(token));
    expect(hash).not.toContain(token.slice(0, 12));
  });

  it('produces different hashes for different tokens', async () => {
    const a = await hashToken('token-a');
    const b = await hashToken('token-b');
    expect(a).not.toBe(b);
  });
});

describe('TTL parsing', () => {
  it('converts the configured token lifetimes', () => {
    expect(ttlToSeconds('15m')).toBe(900);
    expect(ttlToSeconds('30d')).toBe(2_592_000);
    expect(ttlToSeconds('1h')).toBe(3600);
    expect(ttlToSeconds('45s')).toBe(45);
  });

  it('returns zero for anything it does not understand', () => {
    expect(ttlToSeconds('soon')).toBe(0);
    expect(ttlToSeconds('')).toBe(0);
  });
});
