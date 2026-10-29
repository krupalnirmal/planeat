import { z } from 'zod';
import { ApiError, parseQuery, route } from '@/lib/api/handler';
import { ok } from '@/lib/api/response';
import { env } from '@/lib/env';
import { latitudeSchema, longitudeSchema } from '@/lib/validators/common';

export const dynamic = 'force-dynamic';

const querySchema = z.object({ lat: latitudeSchema, lng: longitudeSchema });

interface ResolvedAddress {
  line1: string;
  landmark: string;
  city: string;
  state: string;
  pincode: string;
  displayName: string;
}

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

/** OpenStreetMap's Nominatim — no API key, no billing, but Indian address
    coverage outside major metros is sparse (the original implementation
    here, kept as the no-key fallback). */
async function resolveViaNominatim(lat: number, lng: number): Promise<ResolvedAddress | null> {
  const url = new URL('https://nominatim.openstreetmap.org/reverse');
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('lat', String(lat));
  url.searchParams.set('lon', String(lng));
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('zoom', '18');

  const res = await fetch(url, {
    headers: { 'User-Agent': 'GetFresh-app/1.0 (delivery address lookup)' },
  });
  if (!res.ok) return null;

  const json = (await res.json()) as NominatimResponse;
  if (json.error || !json.address) return null;

  const a = json.address;
  const line1 = [a.house_number, a.road].filter(Boolean).join(' ') || a.neighbourhood || a.suburb || '';
  const city = a.city || a.town || a.village || a.suburb || '';

  return {
    line1,
    landmark: a.neighbourhood && a.neighbourhood !== line1 ? a.neighbourhood : '',
    city,
    state: a.state || 'Maharashtra',
    pincode: a.postcode || '',
    displayName: json.display_name || '',
  };
}

interface GoogleAddressComponent {
  long_name: string;
  short_name: string;
  types: string[];
}

interface GoogleGeocodeResult {
  formatted_address: string;
  address_components: GoogleAddressComponent[];
  types: string[];
}

interface GoogleGeocodeResponse {
  status: string;
  results: GoogleGeocodeResult[];
}

function componentFor(components: GoogleAddressComponent[], type: string): string {
  return components.find((c) => c.types.includes(type))?.long_name ?? '';
}

// Google's Open Location Code ("Plus Code") short form — 4-8 base-20 chars,
// a '+', then 2-3 more (e.g. "XQRJ+33V"). Google prepends this to
// `formatted_address` itself (not just a separate plus_code-typed result)
// whenever a point has no named street to anchor on, which is common in
// newer Nashik residential layouts — accurate, but meaningless to a
// customer. Stripped from the front of whichever address text is shown.
const PLUS_CODE_PREFIX = /^[23456789CFGHJMPQRVWX]{4,8}\+[23456789CFGHJMPQRVWX]{2,3},?\s*/i;

function stripPlusCode(address: string): string {
  const stripped = address.replace(PLUS_CODE_PREFIX, '').trim();
  return stripped || address;
}

/** Google's Geocoding API — client feedback (session 2026-10-27): Nominatim
    was leaving "use current location" with the wrong/blank street and
    locality for Nashik addresses. Google's India coverage is far denser
    (house number + named sublocality on most residential streets, not just
    arterial roads), at the cost of needing a billed API key
    (`env.geocoding.googleMapsApiKey` — empty falls back to Nominatim above,
    so a key-less dev clone still works). */
async function resolveViaGoogle(lat: number, lng: number): Promise<ResolvedAddress | null> {
  const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
  url.searchParams.set('latlng', `${lat},${lng}`);
  url.searchParams.set('key', env.geocoding.googleMapsApiKey);
  // Biases ambiguous component matches (e.g. a locality name that also
  // exists elsewhere) toward India — this app only ever delivers in Nashik.
  url.searchParams.set('region', 'in');
  url.searchParams.set('language', 'en');

  const res = await fetch(url);
  if (!res.ok) return null;

  const json = (await res.json()) as GoogleGeocodeResponse;
  if (json.status !== 'OK' || json.results.length === 0) return null;

  // Client feedback (session 2026-10-29) — the raw first result for a point
  // with no precise street-level coverage (common in newer Nashik layouts
  // like Dnyaneshwar Nagar) is a "plus_code" result: a Google geocode
  // (e.g. "XQRJ+33V"), accurate but meaningless to a customer typing an
  // address. Skip past any plus_code-only result to the next, more human
  // one (sublocality/locality) when one exists, rather than showing the
  // code as the detected address.
  const best = json.results.find((r) => !r.types.includes('plus_code')) ?? json.results[0];
  const components = best.address_components;
  const streetNumber = componentFor(components, 'street_number');
  const route = componentFor(components, 'route');
  const sublocality =
    componentFor(components, 'sublocality_level_2') ||
    componentFor(components, 'sublocality_level_1') ||
    componentFor(components, 'sublocality') ||
    componentFor(components, 'neighborhood');
  const city =
    componentFor(components, 'locality') || componentFor(components, 'administrative_area_level_2');
  const state = componentFor(components, 'administrative_area_level_1');
  const postcode = componentFor(components, 'postal_code');

  const line1 = [streetNumber, route].filter(Boolean).join(' ') || sublocality;

  return {
    line1,
    landmark: sublocality && sublocality !== line1 ? sublocality : '',
    city,
    state: state || 'Maharashtra',
    pincode: postcode,
    displayName: stripPlusCode(best.formatted_address),
  };
}

/**
 * GET /api/geocode/reverse?lat=&lng= — turns "use current location" into a
 * filled-in address instead of a pair of numbers the customer has to
 * transcribe by hand.
 *
 * Google's Geocoding API when a key is configured (far better Indian
 * address coverage — see `resolveViaGoogle`'s own comment); otherwise the
 * original key-less Nominatim lookup, so this still works with no setup on
 * a fresh clone. Server-side either way: Nominatim's usage policy requires
 * a descriptive User-Agent the browser's fetch cannot set, and the Google
 * key must never reach client-side JS.
 */
export const GET = route(async (request: Request) => {
  const { lat, lng } = parseQuery(request, querySchema);

  const resolved = env.geocoding.googleMapsApiKey
    ? ((await resolveViaGoogle(lat, lng)) ?? (await resolveViaNominatim(lat, lng)))
    : await resolveViaNominatim(lat, lng);

  if (!resolved) throw ApiError.badRequest('Could not look up that location');

  return ok(resolved);
});
