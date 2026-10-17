import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Vendor order-packing (session 2026-10-17) — `findNearestVendor()`
 * replaces the earlier ServiceArea-based match (removed the same day, on
 * client feedback) with real distance. Coordinates below are rough but
 * genuinely ordered by distance from the fixed point (19.9975, 73.7898,
 * College Road, Nashik) — not placeholder numbers.
 */

const dbMock = vi.hoisted(() => ({
  vendor: { findMany: vi.fn() },
}));

vi.mock('@/lib/db', () => ({ db: dbMock }));

import { findNearestVendor } from '@/lib/vendor/match';

beforeEach(() => {
  vi.clearAllMocks();
});

const FIXED_POINT = { latitude: 19.9975, longitude: 73.7898 };

describe('findNearestVendor', () => {
  it('is null when the address has no coordinates', async () => {
    expect(await findNearestVendor(null, 73.7898)).toBeNull();
    expect(await findNearestVendor(19.9975, undefined)).toBeNull();
    expect(dbMock.vendor.findMany).not.toHaveBeenCalled();
  });

  it('is null when no active vendor has a pin', async () => {
    dbMock.vendor.findMany.mockResolvedValue([]);

    const result = await findNearestVendor(FIXED_POINT.latitude, FIXED_POINT.longitude);

    expect(result).toBeNull();
  });

  it('only queries active, pinned vendors', async () => {
    dbMock.vendor.findMany.mockResolvedValue([]);

    await findNearestVendor(FIXED_POINT.latitude, FIXED_POINT.longitude);

    expect(dbMock.vendor.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { isActive: true, latitude: { not: null }, longitude: { not: null } },
      }),
    );
  });

  it('picks the genuinely closest of three vendors, regardless of array order', async () => {
    // Far (Nashik Road, ~9 km), near (same street, ~0.3 km), middle (CIDCO, ~4 km).
    dbMock.vendor.findMany.mockResolvedValue([
      { id: 'vnd_far', latitude: 20.0, longitude: 73.86 },
      { id: 'vnd_near', latitude: 19.999, longitude: 73.792 },
      { id: 'vnd_middle', latitude: 19.97, longitude: 73.76 },
    ]);

    const result = await findNearestVendor(FIXED_POINT.latitude, FIXED_POINT.longitude);

    expect(result).toEqual({ id: 'vnd_near' });
  });
});
