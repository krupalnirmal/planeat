import { describe, expect, it } from 'vitest';
import { haversineMeters, isValidPincode } from '@/lib/serviceability';

/**
 * B11 — pincode allow-list AND an 8 km radius. The database half is covered by
 * the API tests once a database exists; the distance maths is pure and is
 * pinned here, because getting it wrong means either refusing real customers
 * or promising delivery we cannot make.
 */

// The seeded store location: Pathardi, Ahmednagar district.
const PATHARDI = { lat: 19.1739, lng: 75.1817 };
const RADIUS = 8000;

describe('haversine distance', () => {
  it('is zero at the same point', () => {
    expect(haversineMeters(PATHARDI.lat, PATHARDI.lng, PATHARDI.lat, PATHARDI.lng)).toBe(0);
  });

  it('is symmetric', () => {
    const a = haversineMeters(19.17, 75.18, 19.35, 75.23);
    const b = haversineMeters(19.35, 75.23, 19.17, 75.18);
    expect(a).toBeCloseTo(b, 6);
  });

  it('matches a known separation', () => {
    // Pathardi → Shevgaon, both seeded service areas. Straight-line ~19.7 km.
    const distance = haversineMeters(19.1739, 75.1817, 19.3494, 75.2296);
    expect(distance).toBeGreaterThan(18_000);
    expect(distance).toBeLessThan(22_000);
  });

  it('puts one degree of latitude at roughly 111 km', () => {
    const distance = haversineMeters(19, 75, 20, 75);
    expect(distance).toBeGreaterThan(110_000);
    expect(distance).toBeLessThan(112_000);
  });

  it('accepts a point inside the 8 km radius and rejects one outside', () => {
    // ~5.5 km north of the store.
    const inside = haversineMeters(PATHARDI.lat, PATHARDI.lng, 19.2239, 75.1817);
    expect(inside).toBeLessThan(RADIUS);

    // Shevgaon is a separate service area precisely because it is too far.
    const outside = haversineMeters(PATHARDI.lat, PATHARDI.lng, 19.3494, 75.2296);
    expect(outside).toBeGreaterThan(RADIUS);
  });

  it('does not overflow at antipodal points', () => {
    // Math.sqrt of a value slightly above 1 through float error would produce
    // NaN without the clamp in the implementation.
    const distance = haversineMeters(0, 0, 0, 180);
    expect(Number.isFinite(distance)).toBe(true);
    expect(distance).toBeGreaterThan(20_000_000);
  });
});

describe('pincode validation', () => {
  it('accepts the seeded Pathardi pincodes', () => {
    for (const pincode of ['414102', '414103', '414105', '414502']) {
      expect(isValidPincode(pincode)).toBe(true);
    }
  });

  it('rejects malformed pincodes', () => {
    expect(isValidPincode('014102')).toBe(false); // no leading zero
    expect(isValidPincode('41410')).toBe(false); // too short
    expect(isValidPincode('4141021')).toBe(false); // too long
    expect(isValidPincode('41410a')).toBe(false);
    expect(isValidPincode('')).toBe(false);
  });
});
