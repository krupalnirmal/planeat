import createMiddleware from 'next-intl/middleware';
import { routing } from '@/i18n/routing';

/**
 * Adds the locale prefix on `mr`/`hi` page URLs and resolves `/...` to the
 * default locale ('en') directly, without a redirect (B15, `localePrefix:
 * 'as-needed'` in `@/i18n/routing`).
 *
 * Named `proxy.ts` rather than `middleware.ts`: Next 16 renamed the convention
 * and warns on every dev start about the old one.
 *
 * API routes, static files and the service worker are excluded — a locale
 * prefix on `/api/orders` would be nonsense. `launch` (the TWA's cold-start
 * redirect, `src/app/launch/route.ts`) is excluded for the same reason: it
 * must run before any locale is decided, not get rewritten to one first.
 */
export default createMiddleware(routing);

export const config = {
  matcher: ['/((?!api|_next|_vercel|manifest.json|sw.js|icons|uploads|launch|.*\\..*).*)'],
};
