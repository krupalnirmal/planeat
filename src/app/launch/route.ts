import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { isAppLocale } from '@/i18n/routing';

/**
 * The Android (TWA) app's fixed cold-start target — see `public/manifest.json`'s
 * `start_url` and `locale-sync.tsx`'s `writePreferredLocale`. Deliberately
 * outside the `[locale]` segment and excluded from `proxy.ts`'s matcher, so
 * next-intl never gets a chance to rewrite it to a locale first.
 *
 * Resolves the customer's own last explicit choice (the `gf_pref_locale`
 * cookie) server-side, before any HTML paints — unlike `LocaleSync`, which
 * only runs after hydration and would otherwise flash the wrong language on
 * every cold launch. No cookie yet (fresh install, nothing picked) falls
 * back to `/en`, matching `routing.ts`'s `DEFAULT_LOCALE`.
 */
const FALLBACK_LOCALE = 'en';

export async function GET(request: Request) {
  const jar = await cookies();
  const stored = jar.get('gf_pref_locale')?.value;
  const locale = stored && isAppLocale(stored) ? stored : FALLBACK_LOCALE;
  const path = locale === 'en' ? '/' : `/${locale}`;
  return NextResponse.redirect(new URL(path, request.url));
}
