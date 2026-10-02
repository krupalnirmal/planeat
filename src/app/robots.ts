import type { MetadataRoute } from 'next';
import { env } from '@/lib/env';

/**
 * SEO audit (session 2026-10-02) — getfrresh.com had no robots.txt at all
 * (404), one of several reasons the site was never indexed by Google.
 * Next.js serves this file's output at /robots.txt automatically.
 *
 * Admin/delivery/staff-login are already behind auth, but disallowing them
 * here too keeps crawl budget on the pages that should actually rank, and
 * keeps a login page from ever showing up in search results.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/api/', '/*/admin/', '/*/delivery/', '/*/staff/'],
    },
    sitemap: `${env.appUrl}/sitemap.xml`,
    host: env.appUrl,
  };
}
