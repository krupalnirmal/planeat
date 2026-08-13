import { parseQuery, route } from '@/lib/api/handler';
import { ok } from '@/lib/api/response';
import { checkServiceability } from '@/lib/serviceability';
import { serviceabilityQuerySchema } from '@/lib/validators/address';

export const dynamic = 'force-dynamic';

/**
 * GET /api/serviceability?pincode= | ?lat=&lng=
 *
 * Public: this is the very first screen a new user sees (M1), before any
 * login. A non-serviceable answer routes them to the waitlist.
 */
export const GET = route(async (request: Request) => {
  const query = parseQuery(request, serviceabilityQuerySchema);

  const result = await checkServiceability({
    pincode: query.pincode,
    latitude: query.lat,
    longitude: query.lng,
  });

  return ok(result);
});
