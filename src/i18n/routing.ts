import { defineRouting } from 'next-intl/routing';

/**
 * B15 — the client set the default language explicitly rather than relying
 * on browser detection.
 *
 * `localePrefix: 'always'` keeps every URL explicit (`/mr/...`, `/hi/...`,
 * `/en/...`). Ambiguous root URLs are the usual source of "why is my page
 * suddenly English" bugs, and an explicit prefix is also what makes the
 * language switcher a plain link rather than a client-side state hack.
 */

export const LOCALES = ['mr', 'hi', 'en'] as const;
export type AppLocale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: AppLocale = 'en';

export const LOCALE_LABELS: Record<AppLocale, string> = {
  mr: 'मराठी',
  hi: 'हिंदी',
  en: 'English',
};

export const routing = defineRouting({
  locales: LOCALES,
  defaultLocale: DEFAULT_LOCALE,
  localePrefix: 'always',
  localeDetection: false,
});

export function isAppLocale(value: string): value is AppLocale {
  return (LOCALES as readonly string[]).includes(value);
}
