'use client';

import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';

/**
 * The single intro slide the client's reference shows — a tinted band, one
 * headline, and dot pagination. The client only supplied copy for this one
 * slide, so this stays a static screen rather than a carousel with invented
 * copy for slides nobody asked for; the three dots are the reference's own
 * pagination art, kept as-is with the first dot active.
 */
export function OnboardingScreen() {
  const t = useTranslations('intro');
  const router = useRouter();

  return (
    <main className="flex min-h-dvh flex-col bg-tint-green px-6 pt-14 pb-8 text-center">
      <div className="flex flex-1 flex-col items-center justify-center">
        <h1 className="text-[26px] leading-tight font-black text-primary-dark text-balance">
          {t('onboardingTitle')}
        </h1>
        <p className="mt-2 text-sm font-medium text-muted-foreground">
          {t('onboardingSubtitle')}
        </p>

        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/promo/veg-basket-hero.jpg"
          alt=""
          aria-hidden
          className="mt-8 w-full max-w-[300px] rounded-[var(--radius)]"
        />
      </div>

      <div className="flex items-center justify-center gap-1.5" aria-hidden>
        <span className="h-1.5 w-5 rounded-full bg-primary" />
        <span className="h-1.5 w-1.5 rounded-full bg-primary/30" />
        <span className="h-1.5 w-1.5 rounded-full bg-primary/30" />
      </div>

      <button
        type="button"
        onClick={() => router.replace('/select-language')}
        className="mt-6 h-12 w-full rounded-[var(--radius)] bg-primary text-base font-bold text-primary-foreground"
      >
        {t('next')}
      </button>
    </main>
  );
}
