'use client';

import { useLocale } from 'next-intl';
import { useParams } from 'next/navigation';
import { useEffect } from 'react';
import { usePathname, useRouter } from '@/i18n/navigation';
import { isAppLocale, type AppLocale } from '@/i18n/routing';

/**
 * Keeps a customer's explicit language choice sticky across the phone's own
 * back button (session 2026-09-27, user report — choosing English, then
 * pressing the device back button instead of an in-app one, showed Marathi
 * again). Root cause: `next-intl`'s middleware always trusts an explicit
 * locale segment already in the URL over anything else (by design, so a
 * shared `/mr/...` link never silently opens in a different language for
 * someone else) — so going back to a page visited before the switch, which
 * still has the old locale baked into its URL, renders in that old locale
 * again. The `NEXT_LOCALE` cookie next-intl itself manages can't fix this
 * either: the middleware overwrites it to match whichever URL was just
 * requested, so by the time a page loads it already reflects that page's
 * own locale, not "the language the customer actually picked."
 *
 * `PREFERENCE_KEY` is a separate, unmanaged channel `LanguageSwitcher`
 * writes to on every explicit pick — nothing else ever touches it. This
 * component just reconciles the two: whenever the rendered locale disagrees
 * with that stored preference (an in-app navigation or a history
 * traversal), it replaces the current URL with the preferred locale's
 * version of the same path.
 */
const PREFERENCE_KEY = 'getfresh.preferred-locale';

/**
 * Mirrors the same choice into a plain (non-httpOnly) cookie so the server
 * can see it too — `localStorage` only exists in the browser. Read by
 * `/launch` (session 2026-11-22, client report: a customer picked English,
 * but every time they reopened the Android app it showed Marathi again).
 * Root cause: the TWA always relaunches at the fixed `start_url` baked into
 * `public/manifest.json`, which was hardcoded to `/mr` — nothing about that
 * cold start ever looked at what the customer had actually picked. `/launch`
 * now owns that redirect, which is why `start_url` points there instead.
 */
const PREFERENCE_COOKIE = 'gf_pref_locale';

export function readPreferredLocale(): AppLocale | null {
  try {
    const value = window.localStorage.getItem(PREFERENCE_KEY);
    return value && isAppLocale(value) ? value : null;
  } catch {
    return null; // Private mode — behave as if nothing was ever picked.
  }
}

export function writePreferredLocale(locale: AppLocale): void {
  try {
    window.localStorage.setItem(PREFERENCE_KEY, locale);
  } catch {
    // Quota or private mode — the switch itself still works for this tab.
  }
  try {
    const maxAgeSeconds = 60 * 60 * 24 * 365;
    document.cookie = `${PREFERENCE_COOKIE}=${locale}; path=/; max-age=${maxAgeSeconds}; samesite=lax`;
  } catch {
    // Same fallback as above — the in-tab switch itself is unaffected.
  }
}

export function LocaleSync() {
  const locale = useLocale() as AppLocale;
  const pathname = usePathname();
  const params = useParams();
  const router = useRouter();

  useEffect(() => {
    const preferred = readPreferredLocale();
    if (preferred && preferred !== locale) {
      router.replace(
        // @ts-expect-error — pathname is a runtime string; params carry any
        // dynamic segments of the current route across the locale change,
        // same cast `LanguageSwitcher` already uses for this call.
        { pathname, params },
        { locale: preferred },
      );
    }
    // Re-checked on every render this effect fires for — a plain in-app
    // navigation (pathname changes) and a back/forward traversal (locale
    // changes, since it's a fresh page render under a different URL) both
    // need this, so both are dependencies.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locale, pathname]);

  return null;
}
