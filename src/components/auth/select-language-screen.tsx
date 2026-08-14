'use client';

import { Check } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import { LOCALES, LOCALE_LABELS, type AppLocale } from '@/i18n/routing';
import { cn } from '@/lib/utils';

/**
 * B15 — the client picked the default language explicitly rather than
 * relying on browser detection, and wants that same explicit choice offered
 * to every first-time visitor up front, not buried in profile settings.
 */
export function SelectLanguageScreen() {
  const t = useTranslations('intro');
  const currentLocale = useLocale() as AppLocale;
  const router = useRouter();

  const [selected, setSelected] = useState<AppLocale>(currentLocale);

  function confirm() {
    router.replace('/login', { locale: selected });
  }

  return (
    <main className="flex min-h-dvh flex-col px-6 pt-14 pb-8">
      <div className="text-center">
        <h1 className="text-2xl font-black">{t('chooseLanguageTitle')}</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">{t('chooseLanguageSubtitle')}</p>
      </div>

      <div className="mt-8 flex flex-1 flex-col gap-3">
        {LOCALES.map((code) => {
          const active = code === selected;
          return (
            <button
              key={code}
              type="button"
              onClick={() => setSelected(code)}
              aria-pressed={active}
              className={cn(
                'input-3d flex h-14 items-center justify-between rounded-[var(--radius)] border px-4 text-base font-bold',
                active ? 'border-primary bg-tint-green text-primary-dark' : 'border-border/60 bg-card',
              )}
            >
              {LOCALE_LABELS[code]}
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
        className="h-14 w-full rounded-[var(--radius)] bg-primary text-base font-bold text-primary-foreground"
      >
        {t('continue')}
      </button>
    </main>
  );
}
