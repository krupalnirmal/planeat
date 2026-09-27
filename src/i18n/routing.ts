import { defineRouting } from 'next-intl/routing';

/**
 * B15 — the client set the default language explicitly rather than relying
 * on browser detection.
 *
 * `localePrefix: 'as-needed'` (session 2026-09-27, business requirement —
 * `getfrresh.com/` must serve content directly, not 307-redirect to `/en`,
 * so payment-gateway and other automated URL-liveness checks see a bare 200
 * at the root) keeps the default locale ('en') unprefixed at `/...` while
 * `mr`/`hi` still get an explicit prefix (`/mr/...`, `/hi/...`). The
 * language switcher stays a plain link either way — `createNavigation`
 * (`@/i18n/navigation`) adapts `Link`/`useRouter`/`getPathname` to whatever
 * strategy is declared here, so nothing else in the app needs to know.
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
  localePrefix: 'as-needed',
  localeDetection: false,
});

export function isAppLocale(value: string): value is AppLocale {
  return (LOCALES as readonly string[]).includes(value);
}
