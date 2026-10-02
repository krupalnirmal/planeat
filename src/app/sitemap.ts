import type { MetadataRoute } from 'next';
import { DEFAULT_LOCALE, LOCALES, type AppLocale } from '@/i18n/routing';
import { getCategories } from '@/lib/catalog/queries';
import { db } from '@/lib/db';
import { env } from '@/lib/env';

/**
 * SEO audit (session 2026-10-02) — getfrresh.com had no sitemap.xml at all
 * (404), one of several reasons the site was never indexed by Google.
 * Next.js serves this file's output at /sitemap.xml automatically; it's
 * also what robots.ts points crawlers at.
 *
 * Revalidates hourly rather than being fully dynamic — a sitemap a few
 * minutes stale after a new product goes live costs nothing (Google doesn't
 * re-crawl that fast anyway), and this avoids a DB round trip on every
 * crawler hit.
 */
export const revalidate = 3600;

const STATIC_PATHS: Array<{
  path: string;
  priority: number;
  changeFrequency: NonNullable<MetadataRoute.Sitemap[number]['changeFrequency']>;
}> = [
  { path: '/', priority: 1, changeFrequency: 'daily' },
  { path: '/categories', priority: 0.8, changeFrequency: 'weekly' },
  { path: '/privacy', priority: 0.3, changeFrequency: 'yearly' },
  { path: '/terms', priority: 0.3, changeFrequency: 'yearly' },
];

// `localePrefix: 'as-needed'` (src/i18n/routing.ts) — the default locale
// ('en') is unprefixed at `/...`; mr/hi get an explicit `/mr/...`, `/hi/...`.
function localePath(locale: AppLocale, path: string): string {
  const prefix = locale === DEFAULT_LOCALE ? '' : `/${locale}`;
  return `${env.appUrl}${prefix}${path}`;
}

function languageAlternates(path: string): Record<string, string> {
  return Object.fromEntries(LOCALES.map((locale) => [locale, localePath(locale, path)]));
}

function entriesFor(
  path: string,
  lastModified: Date,
  changeFrequency: NonNullable<MetadataRoute.Sitemap[number]['changeFrequency']>,
  priority: number,
): MetadataRoute.Sitemap {
  const alternates = { languages: languageAlternates(path) };
  return LOCALES.map((locale) => ({
    url: localePath(locale, path),
    lastModified,
    changeFrequency,
    priority,
    alternates,
  }));
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Two queries regardless of catalogue size (PART 12) — categories already
  // comes from the existing catalogue read; products is a dedicated light
  // projection, not the full card payload every other caller needs.
  const [categories, products] = await Promise.all([
    getCategories('en'),
    db.product.findMany({
      where: { isActive: true },
      select: { id: true, updatedAt: true },
    }),
  ]);

  const now = new Date();

  return [
    ...STATIC_PATHS.flatMap(({ path, priority, changeFrequency }) =>
      entriesFor(path, now, changeFrequency, priority),
    ),
    ...categories.flatMap((category) =>
      entriesFor(`/category/${category.slug}`, now, 'weekly', 0.7),
    ),
    ...products.flatMap((product) =>
      entriesFor(`/product/${product.id}`, product.updatedAt, 'weekly', 0.6),
    ),
  ];
}
