import { z } from 'zod';
import { ApiError, parseQuery, route } from '@/lib/api/handler';
import { ok } from '@/lib/api/response';
import { latitudeSchema, longitudeSchema } from '@/lib/validators/common';

export const dynamic = 'force-dynamic';

const querySchema = z.object({ lat: latitudeSchema, lng: longitudeSchema });

interface NominatimAddress {
  house_number?: string;
  road?: string;
  neighbourhood?: string;
  suburb?: string;
  city?: string;
  town?: string;
  village?: string;
  state?: string;
  postcode?: string;
}

interface NominatimResponse {
  display_name?: string;
  address?: NominatimAddress;
  error?: string;
}

/**
 * GET /api/geocode/reverse?lat=&lng= — turns "use current location" into a
 * filled-in address instead of a pair of numbers the customer has to
 * transcribe by hand.
 *
 * OpenStreetMap's Nominatim, over plain fetch: no API key, no billing, and
 * good enough coverage for Maharashtra. Server-side because Nominatim's usage
 * policy requires a descriptive User-Agent identifying the app, which the
 * browser's fetch cannot set.
 */
export const GET = route(async (request: Request) => {
  const { lat, lng } = parseQuery(request, querySchema);

  const url = new URL('https://nominatim.openstreetmap.org/reverse');
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('lat', String(lat));
  url.searchParams.set('lon', String(lng));
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('zoom', '18');

  const res = await fetch(url, {
    headers: { 'User-Agent': 'GetFresh-app/1.0 (delivery address lookup)' },
  });

  if (!res.ok) throw ApiError.badRequest('Could not look up that location');

  const json = (await res.json()) as NominatimResponse;
  if (json.error || !json.address) throw ApiError.badRequest('Could not look up that location');

  const a = json.address;
  const line1 = [a.house_number, a.road].filter(Boolean).join(' ') || a.neighbourhood || a.suburb || '';
  const city = a.city || a.town || a.village || a.suburb || '';

  return ok({
    line1,
    landmark: a.neighbourhood && a.neighbourhood !== line1 ? a.neighbourhood : '',
    city,
    state: a.state || 'Maharashtra',
    pincode: a.postcode || '',
    displayName: json.display_name || '',
  });
});
