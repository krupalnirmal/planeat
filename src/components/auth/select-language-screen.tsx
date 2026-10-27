'use client';

import { ArrowRight, Check, Leaf } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import { IntroBackground } from '@/components/auth/intro-background';
import { LOCALES, LOCALE_LABELS, type AppLocale } from '@/i18n/routing';
import { cn } from '@/lib/utils';

/**
 * B15 — the client picked the default language explicitly rather than
 * relying on browser detection, and wants that same explicit choice offered
 * to every first-time visitor up front, not buried in profile settings.
 *
 * Restyled (session 2026-10-27, client reference) — same green-gradient-and-
 * leaves backdrop as `OnboardingScreen`/the login phone step
 * (`IntroBackground`), options moved into a raised white card with a leaf
 * icon per row and a two-line label (the language's own English name above
 * its native script) instead of the plain bordered list this used to be.
 */

/** The language's own English name, paired with `LOCALE_LABELS`'s native
    script below it — a label only used on this one screen, so it stays
    local rather than growing `routing.ts`'s exported contract for one
    screen's two-line display. */
const LOCALE_ENGLISH_NAMES: Record<AppLocale, string> = {
  mr: 'Marathi',
  hi: 'Hindi',
  en: 'English',
};

export function SelectLanguageScreen() {
  const t = useTranslations('intro');
  const currentLocale = useLocale() as AppLocale;
  const router = useRouter();

  const [selected, setSelected] = useState<AppLocale>(currentLocale);

  function confirm() {
    router.replace('/login', { locale: selected });
  }

  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center px-6 py-10">
      <IntroBackground />

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/logo.png" alt="getFrresh" className="h-16 w-auto" />

      <div className="card-3d mt-8 w-full rounded-[28px] bg-card px-6 py-7">
        <h1 className="text-xl font-black">{t('chooseLanguageTitle')}</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">{t('chooseLanguageSubtitle')}</p>

        <div className="mt-6 flex flex-col gap-3">
          {LOCALES.map((code) => {
            const active = code === selected;
            return (
              <button
                key={code}
                type="button"
                onClick={() => setSelected(code)}
                aria-pressed={active}
                className={cn(
                  'flex h-16 items-center gap-3 rounded-2xl border px-4 text-left',
                  active ? 'border-primary bg-tint-green' : 'border-border/60 bg-card',
                )}
              >
                <Leaf className={cn('size-5 shrink-0', active ? 'text-primary' : 'text-muted-foreground')} aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block text-base font-bold">{LOCALE_ENGLISH_NAMES[code]}</span>
                  <span className="block text-sm text-muted-foreground">{LOCALE_LABELS[code]}</span>
                </span>
                {active && (
                  <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground">
                    <Check className="size-4" aria-hidden />
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={confirm}
          className="mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-primary text-sm font-bold text-primary-foreground"
        >
          {t('continue')}
          <ArrowRight className="size-4" aria-hidden />
        </button>
      </div>
    </main>
  );
}
