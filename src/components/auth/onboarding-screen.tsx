'use client';

import { ArrowRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { IntroBackground } from '@/components/auth/intro-background';

/**
 * The single intro slide the client's reference shows — a tinted band, one
 * headline, and dot pagination. The client only supplied copy for this one
 * slide, so this stays a static screen rather than a carousel with invented
 * copy for slides nobody asked for; the three dots are the reference's own
 * pagination art, kept as-is with the first dot active.
 *
 * Restyled (session 2026-10-27, client reference) — the green-gradient-and-
 * leaves backdrop (`IntroBackground`, shared with `SelectLanguageScreen` and
 * the login phone step) with the logo and basket floating free above a
 * raised white card, instead of everything sitting loose on a flat tint.
 */
export function OnboardingScreen() {
  const t = useTranslations('intro');
  const router = useRouter();

  return (
    <main className="relative flex min-h-dvh flex-col items-center px-6 pt-10 pb-8">
      <IntroBackground />

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/logo.png" alt="getFrresh" className="h-16 w-auto" />

      <div className="flex flex-1 flex-col items-center justify-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/promo/veg-basket-hero.png"
          alt=""
          aria-hidden
          className="w-full max-w-[280px] drop-shadow-xl"
        />
      </div>

      <div className="card-3d w-full rounded-[28px] bg-card px-6 py-7 text-center">
        <h1 className="text-xl leading-snug font-black text-balance">
          {t('onboardingTitle')}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">{t('onboardingSubtitle')}</p>

        <div className="mt-4 flex items-center justify-center gap-1.5" aria-hidden>
          <span className="h-1.5 w-5 rounded-full bg-primary" />
          <span className="h-1.5 w-1.5 rounded-full bg-primary/30" />
          <span className="h-1.5 w-1.5 rounded-full bg-primary/30" />
        </div>

        <button
          type="button"
          onClick={() => router.replace('/select-language')}
          className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-primary text-sm font-bold text-primary-foreground"
        >
          {t('next')}
          <ArrowRight className="size-4" aria-hidden />
        </button>
      </div>
    </main>
  );
}
