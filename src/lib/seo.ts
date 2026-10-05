import { DEFAULT_LOCALE, LOCALES, type AppLocale } from '@/i18n/routing';
import { env } from '@/lib/env';

/**
 * SEO audit (session 2026-10-02) — shared by sitemap.ts and every page's own
 * generateMetadata, so a page's canonical/hreflang URLs and its sitemap entry
 * can never drift apart (Google treats that mismatch as a signal the
 * canonical claim isn't trustworthy).
 *
 * `localePrefix: 'as-needed'` (src/i18n/routing.ts) — the default locale
 * ('en') is unprefixed at `/...`; mr/hi get an explicit `/mr/...`, `/hi/...`.
 */
export function localePath(locale: AppLocale, path: string): string {
  const prefix = locale === DEFAULT_LOCALE ? '' : `/${locale}`;
  return `${env.appUrl}${prefix}${path}`;
}

export function languageAlternates(path: string): Record<string, string> {
  return {
    ...Object.fromEntries(LOCALES.map((locale) => [locale, localePath(locale, path)])),
    // Shown to a searcher whose browser language matches none of mr/hi/en —
    // falls back to the default locale rather than making Google guess.
    'x-default': localePath(DEFAULT_LOCALE, path),
  };
}

/** A page's own `generateMetadata` — its canonical self plus its siblings in the other two locales. */
export function alternatesFor(locale: AppLocale, path: string) {
  return {
    canonical: localePath(locale, path),
    languages: languageAlternates(path),
  };
}
