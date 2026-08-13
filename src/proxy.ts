import createMiddleware from 'next-intl/middleware';
import { routing } from '@/i18n/routing';

/**
 * Adds the locale prefix to every page URL and redirects `/` to `/mr` (B15).
 *
 * Named `proxy.ts` rather than `middleware.ts`: Next 16 renamed the convention
 * and warns on every dev start about the old one.
 *
 * API routes, static files and the service worker are excluded — a locale
 * prefix on `/api/orders` would be nonsense.
 */
export default createMiddleware(routing);

export const config = {
  matcher: ['/((?!api|_next|_vercel|manifest.json|sw.js|icons|uploads|.*\\..*).*)'],
};
