import { db } from '@/lib/db';
import { SETTING_KEYS, getSettingNumber } from '@/lib/settings';

/**
 * B11 — service area check.
 *
 *   Pincode allow-list AND an 8 km radius from the store. BOTH must pass.
 *
 * The pincode alone is not enough: Indian pincodes cover wide rural areas, and
 * a village 20 km out can share a pincode with the shop. The radius alone is
 * not enough either, because it would happily accept an address across a river
 * with no road. Requiring both is the honest answer.
 *
 * When the customer has not granted location permission we can only check the
 * allow-list; the result reports `radiusChecked: false` so the caller knows the
 * check was partial, and checkout re-validates once an address exists.
 */

export interface ServiceabilityQuery {
  pincode?: string;
  latitude?: number;
  longitude?: number;
}

export interface ServiceabilityResult {
  serviceable: boolean;
  reason: 'OK' | 'PINCODE_NOT_SERVED' | 'OUTSIDE_RADIUS' | 'NO_INPUT';
  /** The matched service area, when one matched. */
  area: { id: string; name: string; pincode: string } | null;
  distanceMeters: number | null;
  radiusChecked: boolean;
  deliveryFeePaise: bigint | null;
  freeDeliveryThresholdPaise: bigint | null;
}

const EARTH_RADIUS_METRES = 6_371_000;

/** Great-circle distance. Accurate to well under a metre at these ranges. */
export function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;

  return 2 * EARTH_RADIUS_METRES * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function isValidPincode(value: string): boolean {
  return /^[1-9]\d{5}$/.test(value.trim());
}

function notServiceable(reason: ServiceabilityResult['reason']): ServiceabilityResult {
  return {
    serviceable: false,
    reason,
    area: null,
    distanceMeters: null,
    radiusChecked: false,
    deliveryFeePaise: null,
    freeDeliveryThresholdPaise: null,
  };
}

export async function checkServiceability(
  query: ServiceabilityQuery,
): Promise<ServiceabilityResult> {
  const hasCoords =
    typeof query.latitude === 'number' &&
    typeof query.longitude === 'number' &&
    Number.isFinite(query.latitude) &&
    Number.isFinite(query.longitude);

  if (!query.pincode && !hasCoords) return notServiceable('NO_INPUT');

  const defaultRadius = await getSettingNumber(SETTING_KEYS.serviceRadiusMeters);

  // One query, not one per area. There are a handful of rows today, but this
  // is the shape that stays correct when the owner expands.
  const areas = await db.serviceArea.findMany({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      pincode: true,
      centerLat: true,
      centerLng: true,
      radiusMeters: true,
      deliveryFeePaise: true,
      freeDeliveryThresholdPaise: true,
    },
  });

  if (areas.length === 0) return notServiceable('PINCODE_NOT_SERVED');

  // ── Pincode branch: the allow-list is the first gate.
  if (query.pincode) {
    const pincode = query.pincode.trim();
    const matched = areas.find((a) => a.pincode === pincode);
    if (!matched) return notServiceable('PINCODE_NOT_SERVED');

    if (!hasCoords) {
      return {
        serviceable: true,
        reason: 'OK',
        area: { id: matched.id, name: matched.name, pincode: matched.pincode },
        distanceMeters: null,
        radiusChecked: false,
        deliveryFeePaise: matched.deliveryFeePaise,
        freeDeliveryThresholdPaise: matched.freeDeliveryThresholdPaise,
      };
    }

    const distance = haversineMeters(
      query.latitude as number,
      query.longitude as number,
      matched.centerLat,
      matched.centerLng,
    );
    const radius = matched.radiusMeters || defaultRadius;

    if (distance > radius) {
      return {
        ...notServiceable('OUTSIDE_RADIUS'),
        area: { id: matched.id, name: matched.name, pincode: matched.pincode },
        distanceMeters: Math.round(distance),
        radiusChecked: true,
      };
    }

    return {
      serviceable: true,
      reason: 'OK',
      area: { id: matched.id, name: matched.name, pincode: matched.pincode },
      distanceMeters: Math.round(distance),
      radiusChecked: true,
      deliveryFeePaise: matched.deliveryFeePaise,
      freeDeliveryThresholdPaise: matched.freeDeliveryThresholdPaise,
    };
  }

  // ── Coordinates-only branch: find the nearest area that covers this point.
  let nearest: { area: (typeof areas)[number]; distance: number } | null = null;

  for (const area of areas) {
    const distance = haversineMeters(
      query.latitude as number,
      query.longitude as number,
      area.centerLat,
      area.centerLng,
    );
    if (!nearest || distance < nearest.distance) nearest = { area, distance };
  }

  if (!nearest) return notServiceable('PINCODE_NOT_SERVED');

  const radius = nearest.area.radiusMeters || defaultRadius;
  if (nearest.distance > radius) {
    return {
      ...notServiceable('OUTSIDE_RADIUS'),
      distanceMeters: Math.round(nearest.distance),
      radiusChecked: true,
    };
  }

  return {
    serviceable: true,
    reason: 'OK',
    area: {
      id: nearest.area.id,
      name: nearest.area.name,
      pincode: nearest.area.pincode,
    },
    distanceMeters: Math.round(nearest.distance),
    radiusChecked: true,
    deliveryFeePaise: nearest.area.deliveryFeePaise,
    freeDeliveryThresholdPaise: nearest.area.freeDeliveryThresholdPaise,
  };
}
