import { db } from '@/lib/db';
import { haversineMeters } from '@/lib/serviceability';

/**
 * Vendor order-packing (session 2026-10-17) — who packs an order is decided
 * by real distance, not by matching a `ServiceArea` (an earlier version from
 * the same day, replaced on client feedback: "the vendor nearest the
 * customer should get it"). `ServiceArea` itself is untouched — it still
 * decides whether we deliver to an address at all
 * (`src/lib/serviceability.ts`'s `checkServiceability()`); this is a
 * separate, later question.
 */

/** The active, pinned vendor physically closest to a delivery address —
    pure in-memory haversine over every active vendor's coordinates, no
    external calls, safe to run inside an order-placement transaction.
    Null when the address has no coordinates or no vendor has a pin — a
    customer's manually-typed address (no "use my location" tap) never
    gets coordinates, so this is a real, expected case, not an error. */
export async function findNearestVendor(
  latitude: number | null | undefined,
  longitude: number | null | undefined,
): Promise<{ id: string } | null> {
  if (latitude == null || longitude == null) return null;

  const vendors = await db.vendor.findMany({
    where: { isActive: true, latitude: { not: null }, longitude: { not: null } },
    select: { id: true, latitude: true, longitude: true },
  });

  let nearest: { id: string } | null = null;
  let nearestMetres = Infinity;
  for (const vendor of vendors) {
    const distance = haversineMeters(latitude, longitude, vendor.latitude!, vendor.longitude!);
    if (distance < nearestMetres) {
      nearestMetres = distance;
      nearest = { id: vendor.id };
    }
  }
  return nearest;
}
