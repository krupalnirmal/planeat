import { describe, expect, it } from 'vitest';
import { assertCronRequest, istDateKey, istNow } from '@/lib/cron';

/**
 * PART 9 — cron routes are authenticated with `Bearer CRON_SECRET`.
 *
 * These endpoints move money and generate orders. Anything that can call them
 * can replay the reconciliation job or the daily-order job at will.
 *
 * The test env leaves CRON_SECRET unset, so `env.cron.secret` falls back to
 * the development default — which is what these assertions use.
 */

const SECRET = 'dev-cron-secret';

function requestWith(headers: Record<string, string>): Request {
  return new Request('https://example.test/api/cron/reconcile-payments', {
    method: 'POST',
    headers,
  });
}

describe('cron authentication', () => {
  it('accepts the correct bearer token', () => {
    expect(() => assertCronRequest(requestWith({ authorization: `Bearer ${SECRET}` }))).not.toThrow();
  });

  it('rejects a missing header', () => {
    expect(() => assertCronRequest(requestWith({}))).toThrow();
  });

  it('rejects a wrong secret', () => {
    expect(() => assertCronRequest(requestWith({ authorization: 'Bearer wrong' }))).toThrow();
  });

  it('rejects the right secret without the Bearer scheme', () => {
    expect(() => assertCronRequest(requestWith({ authorization: SECRET }))).toThrow();
  });

  it('rejects an empty bearer token', () => {
    expect(() => assertCronRequest(requestWith({ authorization: 'Bearer ' }))).toThrow();
  });

  it('rejects a token that merely starts with the secret', () => {
    expect(() =>
      assertCronRequest(requestWith({ authorization: `Bearer ${SECRET}extra` })),
    ).toThrow();
  });
});

describe('IST helpers', () => {
  it('shifts UTC forward by 5 hours 30 minutes', () => {
    const utc = new Date('2026-08-11T00:00:00.000Z');
    expect(istNow(utc).toISOString()).toBe('2026-08-11T05:30:00.000Z');
  });

  it('rolls the date over at 18:30 UTC, which is midnight IST', () => {
    // The 00:30 IST order-generation window sits just after this boundary, so
    // getting it wrong would generate orders for the wrong day.
    expect(istDateKey(new Date('2026-08-11T18:29:00.000Z'))).toBe('2026-08-11');
    expect(istDateKey(new Date('2026-08-11T18:30:00.000Z'))).toBe('2026-08-12');
  });

  it('gives the IST date for the 00:30 generation window', () => {
    // 00:30 IST on 12 August is 19:00 UTC on 11 August.
    expect(istDateKey(new Date('2026-08-11T19:00:00.000Z'))).toBe('2026-08-12');
  });
});
