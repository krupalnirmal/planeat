'use client';

import { Globe } from 'lucide-react';
import { useLocale } from 'next-intl';
import { useParams } from 'next/navigation';
import { useTransition } from 'react';
import { usePathname, useRouter } from '@/i18n/navigation';
import { LOCALES, LOCALE_LABELS, type AppLocale } from '@/i18n/routing';
import { cn } from '@/lib/utils';

/**
 * B15 / M11 — instant language switch, no reload.
 *
 * The switch is a router navigation to the same route under a different locale
 * prefix, so a deep link stays a deep link and the choice survives a refresh
 * without any client-side storage.
 */
export function LanguageSwitcher({ className }: { className?: string }) {
  const locale = useLocale() as AppLocale;
  const pathname = usePathname();
  const params = useParams();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function switchTo(next: AppLocale) {
    if (next === locale) return;
    startTransition(() => {
      router.replace(
        // @ts-expect-error — pathname is a runtime string; params carry any
        // dynamic segments of the current route across the locale change.
        { pathname, params },
        { locale: next },
      );
    });
  }

  return (
    <div
      className={cn(
        'inline-flex items-center gap-1 rounded-full border border-border bg-card p-1',
        pending && 'opacity-60',
        className,
      )}
    >
      <Globe className="ml-1.5 size-4 text-muted-foreground" aria-hidden />
      {LOCALES.map((code) => (
        <button
          key={code}
          type="button"
          onClick={() => switchTo(code)}
          aria-pressed={code === locale}
          className={cn(
            'min-h-9 rounded-full px-3 text-sm transition-colors',
            code === locale
              ? 'bg-primary text-primary-foreground font-semibold'
              : 'text-muted-foreground',
          )}
        >
          {LOCALE_LABELS[code]}
        </button>
      ))}
    </div>
  );
}
